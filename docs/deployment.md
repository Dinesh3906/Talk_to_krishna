# Deployment & Distribution Guide — Talk to Krishna

This document details the production build, container deployment, and Google Play Store submission workflow.

---

## 1. Backend Deployment

The backend service (`services/api`) is designed to run as a stateless container across horizontally scaled instances:

### Docker Build
```bash
docker build -f services/api/Dockerfile -t talk-to-krishna-api:1.0.0 .
```

### Production Migration Runner
Prior to deploying new application containers, run schema migrations as a one-shot job:
```bash
npm --workspace=services/api run migrate
```

### Healthcheck Endpoint
The service provides `/health` returning HTTP 200 with database and provider readiness status.

---

## 2. Android Play Store Deployment (EAS Build)

The mobile application (`apps/mobile`) uses Expo Application Services (EAS) for automated, production-signed Android App Bundle (`.aab`) generation.

### 1. EAS CLI Setup
```bash
npm install -g eas-cli
eas login
```

### 2. Configure EAS Project
In `apps/mobile/app.json`:
- `android.package`: `com.talktokrishna.ai`
- `android.versionCode`: Incremented per release
- `extra.eas.projectId`: Linked to your Expo dashboard project

### 3. Build Android App Bundle (AAB)
```bash
cd apps/mobile
eas build --platform android --profile production
```

### 4. Submit to Google Play Console
```bash
eas submit --platform android --profile production
```
Or download the resulting `.aab` file from the EAS build dashboard and upload it directly to the Google Play Console internal test track.

---

## 3. Web Deployment

To deploy the web version of the client:
```bash
cd apps/mobile
npx expo export --platform web
# Output bundle in dist/ ready for hosting on Cloudflare Pages, Vercel, or AWS S3 + CloudFront
```
