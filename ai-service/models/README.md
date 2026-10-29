# Models

Place detector and recognition model files here for local development.

MVP detection scope is person-only. Generic object detection is not enabled in the first release.

Default detector path:

```text
/app/models/yolo26n.pt
```

For local development with the repository mounted directly:

```text
ai-service/models/yolo26n.pt
```

The YOLO adapter lazy-loads the model on first inference, so `/ai/health` can run before a model file is present.
The default checkpoint is Ultralytics YOLO26n. Keep the model file in this directory so inference does not need to download weights on first use.

The bundled `yolo26n.pt` weights come from the official [Ultralytics assets v8.4.0 release](https://github.com/ultralytics/assets/releases/tag/v8.4.0).
SHA-256: `9b09cc8bf347f0fc8a5f7657480587f25db09b34bf33b0652110fb03a8ad4fef`.
