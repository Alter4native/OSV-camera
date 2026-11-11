from app.recognition.base import FaceRecognizer
from app.recognition.face import InsightFaceRecognizer, SimpleFaceRecognizer
from app.recognition.vector_store import InMemoryEmbeddingStore, QdrantEmbeddingStore


def build_face_recognizer(
    runtime: str,
    threshold: float,
    embedding_dim: int,
    model_name: str,
    embedding_store_runtime: str = "memory",
    qdrant_url: str = "http://qdrant:6333",
    qdrant_collection_name: str = "person_face_embeddings",
    qdrant_api_key: str | None = None,
    qdrant_timeout_seconds: int = 3,
) -> FaceRecognizer:
    normalized_runtime = runtime.lower()
    if normalized_runtime == "simple":
        return SimpleFaceRecognizer(
            threshold=threshold,
            embedding_dim=embedding_dim,
            model_name=model_name,
            store=build_embedding_store(
                runtime=embedding_store_runtime,
                embedding_dim=embedding_dim,
                qdrant_url=qdrant_url,
                qdrant_collection_name=qdrant_collection_name,
                qdrant_api_key=qdrant_api_key,
                qdrant_timeout_seconds=qdrant_timeout_seconds,
            ),
        )
    if normalized_runtime == "insightface":
        return InsightFaceRecognizer(
            threshold=threshold,
            embedding_dim=embedding_dim,
            model_name=model_name,
            store=build_embedding_store(
                runtime=embedding_store_runtime,
                embedding_dim=embedding_dim,
                qdrant_url=qdrant_url,
                qdrant_collection_name=qdrant_collection_name,
                qdrant_api_key=qdrant_api_key,
                qdrant_timeout_seconds=qdrant_timeout_seconds,
            ),
        )

    raise ValueError(f"Unsupported face recognition runtime: {runtime}")


def build_embedding_store(
    runtime: str,
    embedding_dim: int,
    qdrant_url: str,
    qdrant_collection_name: str,
    qdrant_api_key: str | None = None,
    qdrant_timeout_seconds: int = 3,
):
    normalized_runtime = runtime.lower()
    if normalized_runtime == "memory":
        return InMemoryEmbeddingStore()
    if normalized_runtime == "qdrant":
        return QdrantEmbeddingStore(
            url=qdrant_url,
            collection_name=qdrant_collection_name,
            embedding_dim=embedding_dim,
            api_key=qdrant_api_key,
            timeout_seconds=qdrant_timeout_seconds,
        )
    raise ValueError(f"Unsupported embedding store runtime: {runtime}")
