# Supply Chain Verification

corvid-agent Docker images are signed with [Sigstore cosign](https://docs.sigstore.dev/) using keyless signing, and every release includes a CycloneDX SBOM (Software Bill of Materials) attested to the image.

## Prerequisites

Install [cosign](https://docs.sigstore.dev/cosign/system_config/installation/):

```bash
# macOS
brew install cosign

# Linux (download binary)
curl -sSfL https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 -o /usr/local/bin/cosign
chmod +x /usr/local/bin/cosign
```

## Verifying Image Signatures

Every Docker image pushed to `ghcr.io/corvidlabs/corvid-agent` is signed in CI using Sigstore's keyless signing flow (Fulcio + Rekor). Verify a pulled image:

```bash
cosign verify \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp "https://github.com/CorvidLabs/corvid-agent/" \
  ghcr.io/corvidlabs/corvid-agent:<tag>
```

Replace `<tag>` with the version you want to verify (e.g. `0.15.0`, `latest`).

A successful verification prints the signing certificate details and confirms the image was built and signed by the CorvidLabs/corvid-agent GitHub Actions workflow.

## Verifying the SBOM Attestation

Each image has a CycloneDX SBOM attached as an in-toto attestation. To verify and inspect it:

```bash
# Verify the attestation signature and print the SBOM
cosign verify-attestation \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp "https://github.com/CorvidLabs/corvid-agent/" \
  --type cyclonedx \
  ghcr.io/corvidlabs/corvid-agent:<tag>
```

To extract just the SBOM content:

```bash
cosign verify-attestation \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp "https://github.com/CorvidLabs/corvid-agent/" \
  --type cyclonedx \
  ghcr.io/corvidlabs/corvid-agent:<tag> \
  | jq -r '.payload' | base64 -d | jq '.predicate'
```

## Downloading the SBOM from GitHub Releases

Each GitHub Release includes the SBOM as a downloadable asset (`sbom.cyclonedx.json`). You can download it from the [Releases page](https://github.com/CorvidLabs/corvid-agent/releases) or via the CLI:

```bash
gh release download <tag> --pattern 'sbom.cyclonedx.json' --repo CorvidLabs/corvid-agent
```

## How It Works

The release pipeline generates and attaches supply chain metadata automatically:

1. **Build & push**: Multi-platform Docker image is built and pushed to GHCR.
2. **Sign**: cosign signs the image digest using keyless signing (GitHub OIDC token → Fulcio certificate → Rekor transparency log).
3. **SBOM**: [Syft](https://github.com/anchore/syft) scans the pushed image and generates a CycloneDX JSON SBOM.
4. **Attest**: cosign attaches the SBOM to the image as a signed in-toto attestation.
5. **Release asset**: The SBOM is uploaded to the GitHub Release for direct download.

All signing operations are keyless — no long-lived keys to manage. The signing identity is the GitHub Actions workflow, verifiable via Sigstore's public transparency log ([Rekor](https://rekor.sigstore.dev/)).
