# Nibrun deployment

Deployed 11 September 2026: https://entity-library-gf84pk.nibrun.app

App slug: `entity-library-gf84pk`. Redeploy this same app to preserve its hostname, passkeys,
photos and downloaded models. The local `.nibrun.json` records that target and is ignored by Git.

The deployed executable is the tested Linux build, SHA-256
`d77df5df066ca94e275eb617fa01a7120263c1dc1cfe928a2596ef620ad8eb09`.
Deployment ID: `01a090ad-392b-72c8-aaf7-21f5ab08ab5c`.

HTTPS `/health` returned 200, unauthenticated `/api/photos` returned 401, and the model and
both tokenizer files are installed at their expected sizes. Ownership was unclaimed at the
post-deployment check; the user should create their passkey in the app. No owner registration,
photo uploads or destructive integration tests were performed on this deployment.

**Allocation mismatch:** Nibrun provisioned 256 MiB, while this app was validated with a 1 GiB
limit. Its initial reported usage was about 186 MiB. The installed CLI offers no RAM setting;
the planned 1 GB must be enabled on the platform side. Startup usage is not proof that indexing
large photos will fit in 256 MiB.

To redeploy a newly built and tested Linux executable:

```sh
nib --json run ./apps/backend/dist/entity-library --app entity-library-gf84pk --port 3000
nib --json apps status --app entity-library-gf84pk
```

Do not use `--name` for an update: it creates another app.
