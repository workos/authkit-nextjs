# Changelog

## [4.0.1](https://github.com/workos/authkit-nextjs/compare/v4.0.0...v4.0.1) (2026-04-23)


### Bug Fixes

* persist authenticationMethod in sealed session cookie ([#410](https://github.com/workos/authkit-nextjs/issues/410)) ([a8f7def](https://github.com/workos/authkit-nextjs/commit/a8f7def7cf3cbbb38dd1805e8da82a4b10bdf1d9))

## [4.0.0](https://github.com/workos/authkit-nextjs/compare/v3.0.1...v4.0.0) (2026-04-23)


### ⚠ BREAKING CHANGES

* Upgrade @workos-inc/node to v9 ([#407](https://github.com/workos/authkit-nextjs/issues/407))
* set minimum Node.js version to 22.11.0 ([#408](https://github.com/workos/authkit-nextjs/issues/408))

### Miscellaneous Chores

* set minimum Node.js version to 22.11.0 ([#408](https://github.com/workos/authkit-nextjs/issues/408)) ([c394669](https://github.com/workos/authkit-nextjs/commit/c3946698b6a7f369becce8ac9bba83fe7540300b))
* Upgrade @workos-inc/node to v9 ([#407](https://github.com/workos/authkit-nextjs/issues/407)) ([0183951](https://github.com/workos/authkit-nextjs/commit/0183951e281146e973fd4a9884162b008a3dd38d))

## [3.0.1](https://github.com/workos/authkit-nextjs/compare/v3.0.0...v3.0.1) (2026-04-20)


### Bug Fixes

* isolate concurrent PKCE flows to prevent cookie clobbering ([#403](https://github.com/workos/authkit-nextjs/issues/403)) ([3740a83](https://github.com/workos/authkit-nextjs/commit/3740a835df8b51027e8d5bf5011a3877c8648cec))
* set PKCE cookie in ensureSignedIn server action flow ([#406](https://github.com/workos/authkit-nextjs/issues/406)) ([a55bb64](https://github.com/workos/authkit-nextjs/commit/a55bb6467942042325d3015ea735ebd4fa7912d5))

## [3.0.0](https://github.com/workos/authkit-nextjs/compare/v2.17.0...v3.0.0) (2026-03-25)


### ⚠ BREAKING CHANGES

* add OAuth state verification on callback to prevent CSRF attacks ([#388](https://github.com/workos/authkit-nextjs/issues/388))

### Features

* add OAuth state verification on callback to prevent CSRF attacks ([#388](https://github.com/workos/authkit-nextjs/issues/388)) ([ebef6e7](https://github.com/workos/authkit-nextjs/commit/ebef6e7b51556bf08b1714e2d3f5765a59d9c7f0))
* **middleware:** add authkitProxy and handleAuthkitProxy aliases for proxy.ts ([#384](https://github.com/workos/authkit-nextjs/issues/384)) ([4c3f27b](https://github.com/workos/authkit-nextjs/commit/4c3f27b40c9a4ea295ef002dd0a2c32b9740f1ae))


### Bug Fixes

* **actions:** catch TokenRefreshError in refreshAccessTokenAction to prevent 500s ([#383](https://github.com/workos/authkit-nextjs/issues/383)) ([5c46c39](https://github.com/workos/authkit-nextjs/commit/5c46c394fe00b9552665b51ca42b23d00416c704))
* **auth:** return signInUrl from server actions to avoid CORS errors ([#386](https://github.com/workos/authkit-nextjs/issues/386)) ([7d52400](https://github.com/workos/authkit-nextjs/commit/7d52400b8e62bc9d1a4f40b3400ae7586e511098))
* harden PKCE/CSRF for v3.0.0 release ([#398](https://github.com/workos/authkit-nextjs/issues/398)) ([8054829](https://github.com/workos/authkit-nextjs/commit/80548297ac45f15f0774b84e5981b80009412b8b))

## [2.17.0](https://github.com/workos/authkit-nextjs/compare/v2.16.1...v2.17.0) (2026-03-13)


### Features

* Automatically pass claim nonce for unclaimed environments ([#389](https://github.com/workos/authkit-nextjs/issues/389)) ([67dfc92](https://github.com/workos/authkit-nextjs/commit/67dfc921660e1b87e202472a18fa5e5868352275))

## [2.16.1](https://github.com/workos/authkit-nextjs/compare/v2.16.0...v2.16.1) (2026-03-13)


### Bug Fixes

* make PKCE opt-in to avoid breaking custom middleware proxies ([#392](https://github.com/workos/authkit-nextjs/issues/392)) ([9e09fcb](https://github.com/workos/authkit-nextjs/commit/9e09fcb85f16c73f3ed3bc00e2799fadc685feca))

## [2.16.0](https://github.com/workos/authkit-nextjs/compare/v2.15.0...v2.16.0) (2026-03-11)


### Features

* add PKCE support for OAuth 2.1 compliance ([#374](https://github.com/workos/authkit-nextjs/issues/374)) ([de01c7f](https://github.com/workos/authkit-nextjs/commit/de01c7fde33b6d0b65024741a5ba3c492686ec4a))


### Bug Fixes

* improve compatibility with non-Next.js environments ([#378](https://github.com/workos/authkit-nextjs/issues/378)) ([734311a](https://github.com/workos/authkit-nextjs/commit/734311a827a42502d6d2d7897ddbbdfd2d5e3b94))
* resolve Dependabot security alerts ([#380](https://github.com/workos/authkit-nextjs/issues/380)) ([519dccf](https://github.com/workos/authkit-nextjs/commit/519dccff6c76a6d7feb23dabe40e95405406b9f7))

## [2.15.0](https://github.com/workos/authkit-nextjs/compare/v2.14.0...v2.15.0) (2026-02-25)


### Features

* Add `returnTo` option to `getSignInUrl` and `getSignUpUrl ` functions ([#375](https://github.com/workos/authkit-nextjs/issues/375)) ([fc75708](https://github.com/workos/authkit-nextjs/commit/fc7570897068a082f657a60261f5c51d63f1faa5))
