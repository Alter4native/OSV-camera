import hashlib
from threading import Lock
from typing import Any

from app.detection.schemas import BoundingBox
from app.recognition.base import EmbeddingStore, FaceRecognizer
from app.recognition.schemas import (
    FaceEmbedding,
    FaceMatch,
    FaceRecognitionInput,
    FaceRecognitionOutput,
    FaceRecognizerMetadata,
    PersonEmbedding,
    RecognitionDecision,
)
from app.recognition.vector_store import InMemoryEmbeddingStore


class SimpleFaceRecognizer(FaceRecognizer):
    """Deterministic embedding recognizer for MVP wiring and tests.

    This is not a production biometric model. It provides the same contracts
    that the InsightFace/ONNX adapter will use, while keeping local tests fast
    and independent of model downloads.
    """

    def __init__(
        self,
        threshold: float = 0.65,
        embedding_dim: int = 32,
        model_name: str = "simple-hash-face-embedding",
        store: EmbeddingStore | None = None,
    ) -> None:
        if not 0 <= threshold <= 1:
            raise ValueError("threshold must be between 0 and 1")
        if embedding_dim <= 0:
            raise ValueError("embedding_dim must be greater than 0")

        self.threshold = threshold
        self.embedding_dim = embedding_dim
        self.model_name = model_name
        self.store = store or InMemoryEmbeddingStore()

    def enroll(
        self,
        person_id: str,
        image: object,
        face_bbox: BoundingBox,
        photo_id: str | None = None,
    ) -> PersonEmbedding:
        embedding = PersonEmbedding(
            person_id=person_id,
            photo_id=photo_id,
            embedding=self.embed(image=image, face_bbox=face_bbox),
        )
        self.store.upsert(embedding)
        return embedding

    def recognize(self, payload: FaceRecognitionInput) -> FaceRecognitionOutput | None:
        if payload.face_bbox is None:
            return None

        embedding = self.embed(image=payload.image, face_bbox=payload.face_bbox)
        match = self.match(embedding)

        return FaceRecognitionOutput(
            camera_id=payload.camera_id,
            track_id=payload.track_id,
            decision=match.decision,
            score=match.score,
            threshold=match.threshold,
            person_id=match.person_id,
            face_bbox=payload.face_bbox,
        )

    def metadata(self) -> FaceRecognizerMetadata:
        return FaceRecognizerMetadata(
            runtime="simple",
            model_name=self.model_name,
            embedding_dim=self.embedding_dim,
            threshold=self.threshold,
            enrolled_embeddings=self.store.count(),
            embedding_store=self.store.metadata(),
            person_reid_enabled=False,
        )

    def embed(self, image: object, face_bbox: BoundingBox) -> FaceEmbedding:
        digest_source = self._image_bytes(image) + repr(face_bbox.as_xyxy()).encode("utf-8")
        digest = hashlib.sha512(digest_source).digest()
        values: list[float] = []

        while len(values) < self.embedding_dim:
            for byte in digest:
                values.append((byte / 127.5) - 1.0)
                if len(values) == self.embedding_dim:
                    break
            digest = hashlib.sha512(digest).digest()

        return FaceEmbedding(
            vector=tuple(values),
            model_name=self.model_name,
            embedding_dim=self.embedding_dim,
        )

    def match(self, embedding: FaceEmbedding) -> FaceMatch:
        matches = self.store.search(embedding, limit=1)
        if not matches:
            return FaceMatch(
                person_id=None,
                score=0.0,
                threshold=self.threshold,
                decision=RecognitionDecision.UNKNOWN,
            )

        best_embedding, score = matches[0]
        if score >= self.threshold:
            return FaceMatch(
                person_id=best_embedding.person_id,
                score=score,
                threshold=self.threshold,
                decision=RecognitionDecision.KNOWN,
            )

        return FaceMatch(
            person_id=None,
            score=score,
            threshold=self.threshold,
            decision=RecognitionDecision.UNKNOWN,
        )

    def _image_bytes(self, image: Any) -> bytes:
        if isinstance(image, bytes):
            return image
        if isinstance(image, str):
            return image.encode("utf-8")
        if hasattr(image, "tobytes"):
            return image.tobytes()
        return repr(image).encode("utf-8")


class InsightFaceRecognizer(FaceRecognizer):
    def __init__(
        self,
        threshold: float = 0.65,
        model_name: str = "buffalo_l",
        embedding_dim: int = 512,
        store: EmbeddingStore | None = None,
        providers: list[str] | None = None,
    ) -> None:
        if not 0 <= threshold <= 1:
            raise ValueError("threshold must be between 0 and 1")
        if embedding_dim <= 0:
            raise ValueError("embedding_dim must be greater than 0")
        self.threshold = threshold
        self.model_name = model_name
        self.embedding_dim = embedding_dim
        self.store = store or InMemoryEmbeddingStore()
        self.providers = providers or ["CPUExecutionProvider"]
        self._app = None
        self._load_error: str | None = None
        self._load_lock = Lock()

    def enroll(
        self,
        person_id: str,
        image: object,
        face_bbox: BoundingBox,
        photo_id: str | None = None,
    ) -> PersonEmbedding:
        embedding = PersonEmbedding(
            person_id=person_id,
            photo_id=photo_id,
            embedding=self.embed(image, face_bbox),
        )
        self.store.upsert(embedding)
        return embedding

    def recognize(self, payload: FaceRecognitionInput) -> FaceRecognitionOutput | None:
        if payload.face_bbox is None:
            return None
        match = self.match(self.embed(payload.image, payload.face_bbox))
        return FaceRecognitionOutput(
            camera_id=payload.camera_id,
            track_id=payload.track_id,
            decision=match.decision,
            score=match.score,
            threshold=match.threshold,
            person_id=match.person_id,
            face_bbox=payload.face_bbox,
        )

    def metadata(self) -> FaceRecognizerMetadata:
        status = "ready" if self._app is not None else "lazy"
        if self._load_error is not None:
            status = "unavailable"
        return FaceRecognizerMetadata(
            runtime="insightface",
            model_name=self.model_name,
            embedding_dim=self.embedding_dim,
            threshold=self.threshold,
            enrolled_embeddings=self.store.count(),
            embedding_store=self.store.metadata(),
            person_reid_enabled=False,
        )

    def embed(self, image: object, face_bbox: BoundingBox) -> FaceEmbedding:
        import cv2
        import numpy as np

        model = self._get_app()
        frame = self._to_image(image, cv2, np)
        x1, y1, x2, y2 = [int(value) for value in face_bbox.as_xyxy()]
        crop = frame[max(0, y1):max(y1 + 1, y2), max(0, x1):max(x1 + 1, x2)]
        if crop.size == 0:
            raise ValueError("Face bounding box is outside the image")
        faces = model.get(crop)
        if not faces:
            raise ValueError("No face detected in the supplied face bounding box")
        face = max(faces, key=lambda candidate: float(candidate.det_score))
        vector = np.asarray(face.normed_embedding, dtype=np.float32).reshape(-1)
        if vector.size != self.embedding_dim:
            raise ValueError(
                f"InsightFace embedding dimension {vector.size} does not match configured {self.embedding_dim}"
            )
        return FaceEmbedding(
            vector=tuple(float(value) for value in vector),
            model_name=self.model_name,
            embedding_dim=self.embedding_dim,
        )

    def match(self, embedding: FaceEmbedding) -> FaceMatch:
        matches = self.store.search(embedding, limit=1)
        if not matches:
            return FaceMatch(None, 0.0, self.threshold, RecognitionDecision.UNKNOWN)
        best_embedding, score = matches[0]
        if score >= self.threshold:
            return FaceMatch(best_embedding.person_id, score, self.threshold, RecognitionDecision.KNOWN)
        return FaceMatch(None, score, self.threshold, RecognitionDecision.UNKNOWN)

    def _get_app(self):
        if self._app is not None:
            return self._app
        with self._load_lock:
            if self._app is not None:
                return self._app
            try:
                from insightface.app import FaceAnalysis

                app = FaceAnalysis(name=self.model_name, providers=self.providers)
                app.prepare(ctx_id=0, det_size=(640, 640))
                self._app = app
                self._load_error = None
                return app
            except Exception as exc:
                self._load_error = str(exc)
                raise RuntimeError(
                    "InsightFace could not be loaded. Install insightface and onnxruntime, "
                    "and ensure the model pack is available."
                ) from exc

    @staticmethod
    def _to_image(image: object, cv2: object, np: object):
        if isinstance(image, bytes):
            decoded = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
            if decoded is None:
                raise ValueError("Unable to decode image bytes")
            return decoded
        if hasattr(image, "shape"):
            return image
        raise TypeError("InsightFace expects JPEG bytes or a numpy image")
