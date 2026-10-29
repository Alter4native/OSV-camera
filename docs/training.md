# Training and Model Notes

## Current inference model

MVP inference uses a YOLO-compatible model. The default local path is:

```text
ai-service/models/yolo26n.pt
```

Inside Docker:

```text
/app/models/yolo26n.pt
```

The detector is person-only. It filters YOLO outputs to `class_name == "person"` and applies `PERSON_CONFIDENCE_THRESHOLD`.
The runtime uses the bundled YOLO26n checkpoint by default.

## Face recognition model note

Current runtime:

```text
FACE_RECOGNITION_RUNTIME=simple
FACE_EMBEDDING_MODEL_NAME=simple-hash-face-embedding
```

This runtime is deterministic for MVP wiring and tests. It is not a production biometric model. Production face recognition should replace it behind the `FaceRecognizer` contract with an ONNX/InsightFace-style embedding model and store vectors in Qdrant.

## Stage 12

The full training pipeline will be implemented later:
- dataset validation;
- YOLO training config;
- training runner;
- metrics export;
- model registry update.

## Stage 13

Model export and optimization will be implemented later:
- ONNX Runtime;
- TensorRT for NVIDIA;
- OpenVINO for Intel;
- benchmark scripts.
