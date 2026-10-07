# Security scope

VeilReceipt is a local research / hackathon prototype. The review in [docs/REVIEW.zh-CN.md](docs/REVIEW.zh-CN.md) is an engineering review and test record, **not an independent cryptographic or smart-contract audit**.

## Supported use

- Run only on a trusted local machine with synthetic inputs and valueless local ETH.
- The server binds to `127.0.0.1`, checks Host and Origin, and exposes only read methods through its RPC proxy.
- The shared development mnemonic is intentionally public. Never send real funds to its addresses or reuse it on a public network.
- Do not expose the server through port forwarding, tunnels or an internet-facing proxy. The synthetic private-view endpoint is not a production authentication system.

## Dependency status — 2026-10-07

The review upgraded compression to 1.8.2, ethers to 6.17.0, Vite to 7.3.7 and sharp to 0.35.5, and pins the solc temporary-file dependency to tmp 0.2.7. Proof toolchain versions remain pinned for compatibility.

`npm audit` is **not clean**. The final local scan reports 36 affected package entries (5 critical, 22 high, 8 moderate, 1 low), all under Ganache 7.9.2 or its bundled dependencies. Counts depend on the current advisory database; run `npm audit` to obtain the latest result.

Ganache is [archived upstream](https://github.com/ConsenSys-archive/ganache). Its bundled dependencies cannot all be upgraded with ordinary `npm audit fix`; the suggested forced change is a downgrade across major versions. This release does not silently apply that downgrade or suppress the findings. Some entries cover bundled development tools and some cover cryptographic/network dependencies. Local-only use reduces exposure, but does not prove the advisories harmless.

Before any public service or real-funds deployment: migrate to a maintained EVM backend, resolve the dependency findings, implement authentication and resource controls, review the trusted deployment flow, and obtain an independent protocol/contract audit. Publishing this source repository does not publish the local service.

## Protocol boundaries

Provider signatures attest to a commitment, not external truth. The local process knows the original inputs. A buyer can withhold a settlement submission after receiving data; this is not atomic fair exchange. Expiry is not proof of provider misconduct. Acceptance/rejection counters do not provide Sybil resistance.

## Reporting

For a suspected vulnerability, use GitHub's private vulnerability-reporting channel if enabled. Do not include credentials, user data or exploit payloads in public issues. For a non-sensitive reproducibility bug, provide the dependency versions and the failing test name.
