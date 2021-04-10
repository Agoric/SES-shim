# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.4.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/xsnap@0.3.0...@agoric/xsnap@0.4.0) (2021-03-24)


### Bug Fixes

* rename crankStats -> meterUsage ([e0fa380](https://github.com/Agoric/agoric-sdk/commit/e0fa380220a9b0bbc555e55c1d6481c9e48add9b))


### Features

* **xsnap:** enable gc() in the start compartment ([e407fa2](https://github.com/Agoric/agoric-sdk/commit/e407fa2393dfc8b06111d5353123afd92cd6cab6)), closes [#2682](https://github.com/Agoric/agoric-sdk/issues/2682) [#2660](https://github.com/Agoric/agoric-sdk/issues/2660) [#2615](https://github.com/Agoric/agoric-sdk/issues/2615)





# [0.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/xsnap@0.2.1...@agoric/xsnap@0.3.0) (2021-03-16)


### Bug Fixes

* **ava-xs:** anchor match patterns ([c753779](https://github.com/Agoric/agoric-sdk/commit/c7537799e7feb868fcfe6d916fab626244519d32))
* make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)
* properly pin the Moddable SDK version ([58333e0](https://github.com/Agoric/agoric-sdk/commit/58333e069192267fc96e30bb5272edc03b3faa04))
* upgrade ses to 0.12.3 to avoid console noise ([#2552](https://github.com/Agoric/agoric-sdk/issues/2552)) ([f59f5f5](https://github.com/Agoric/agoric-sdk/commit/f59f5f58d1567bb11710166b1dbc80f25c39a04f))
* use git submodule update --init --checkout ([fd3965d](https://github.com/Agoric/agoric-sdk/commit/fd3965de6e578000975fa7cb521689f1872140d2))
* **avaXS:** notDeepEqual confused false with throwing ([a1b7460](https://github.com/Agoric/agoric-sdk/commit/a1b74604a63b89dc499e58e72b8425effae0b809))
* **xsnap:** bounds checking in release builds ([c36f040](https://github.com/Agoric/agoric-sdk/commit/c36f04064ddb7c02bee78a1a07c0fe1fcd4b46d3))
* **xsnap:** freeze API surface ([8c2cc63](https://github.com/Agoric/agoric-sdk/commit/8c2cc63acb78f8a169c53804d64304e8e954f7df))
* **xsnap:** orderly fail-stop on heap exhaustion ([8ffbaa6](https://github.com/Agoric/agoric-sdk/commit/8ffbaa64bf48a63c34fac3245d117a8a6fa6731a))
* **xsnap:** shim HandledPromise before lockdown() ([7e8178a](https://github.com/Agoric/agoric-sdk/commit/7e8178aa4ed8bf300a9e20d46e0c6a51848160d7))
* **xsrepl:** pass command line args thru shell wrapper ([7679200](https://github.com/Agoric/agoric-sdk/commit/7679200fa6b37ec832d72d2662d6f098d4989f37))


### Features

* **ava-xs:** -m title match support ([e89f1e1](https://github.com/Agoric/agoric-sdk/commit/e89f1e1b716b38f9762d4fef914135c4b0078ced))
* **ava-xs:** handle some zoe tests ([#2573](https://github.com/Agoric/agoric-sdk/issues/2573)) ([7789834](https://github.com/Agoric/agoric-sdk/commit/7789834f7d232e395a707c5117295b768ed3fcff)), closes [#2503](https://github.com/Agoric/agoric-sdk/issues/2503)
* **xsnap:** ava work-alike ([2c71b4a](https://github.com/Agoric/agoric-sdk/commit/2c71b4a96b246bcbf89ba1bbb4a44737babccba9))
* **xsnap:** deep stacks work with updated moddable error stacks ([#2579](https://github.com/Agoric/agoric-sdk/issues/2579)) ([6a8fc76](https://github.com/Agoric/agoric-sdk/commit/6a8fc7646eeab48b176b44ebaca115ed9afa7966))
* **xsnap:** unhandled rejections are debuggable ([cbf83be](https://github.com/Agoric/agoric-sdk/commit/cbf83beffbbb57d49a9d945b1b1d975731d4f293))





## [0.2.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/xsnap@0.2.0...@agoric/xsnap@0.2.1) (2021-02-22)


### Bug Fixes

* **xsnap:** lib directory was missing from package files ([5bd8eb8](https://github.com/Agoric/agoric-sdk/commit/5bd8eb848a348877c1674fd8ce55bbc1ae37986a))





# 0.2.0 (2021-02-16)


### Bug Fixes

* **xsnap:** Typo in README re order of REPL ops ([#2188](https://github.com/Agoric/agoric-sdk/issues/2188)) ([18b0cac](https://github.com/Agoric/agoric-sdk/commit/18b0cac663c1a822417b43b3fb2f2c8173fd10a1))
* cleanups and simplifications ([1fe4eae](https://github.com/Agoric/agoric-sdk/commit/1fe4eae27cbe6e97b5f905d921d3e72d167cd108))
* complain if metering is requested but not compiled in ([857d4ba](https://github.com/Agoric/agoric-sdk/commit/857d4ba44eb93fc4f07608255232ca8c2ede7bc0))
* don't hardcode XSNAP_VERSION; get it from package.json ([b418db5](https://github.com/Agoric/agoric-sdk/commit/b418db5773f40c695988b27149612835e75fcd44))
* git should ignore xsnap/dist ([#2312](https://github.com/Agoric/agoric-sdk/issues/2312)) ([097f734](https://github.com/Agoric/agoric-sdk/commit/097f734abd3209ff55d0e78321efb1e0b160af20))
* missing console methods ([#2254](https://github.com/Agoric/agoric-sdk/issues/2254)) ([79e81b0](https://github.com/Agoric/agoric-sdk/commit/79e81b014ea6e3df1a98ef0d35e7cad2d1d966a6))
* reenable Docker builds and deployment ([559ea06](https://github.com/Agoric/agoric-sdk/commit/559ea062251d73e3a6921c85f63631a50ddfad35))
* **xsnap:** Iron out resolution types ([1e2e10d](https://github.com/Agoric/agoric-sdk/commit/1e2e10d78b8e57df6e5eb9ea8f81ba4ded2de8b4))
* **xsnap:** Make xsrepl executable ([#2197](https://github.com/Agoric/agoric-sdk/issues/2197)) ([bd7d738](https://github.com/Agoric/agoric-sdk/commit/bd7d738010e84db7bfbbf13bc7af1e3787243e7c))
* **xsnap:** This is not a smog check ([#2190](https://github.com/Agoric/agoric-sdk/issues/2190)) ([437814c](https://github.com/Agoric/agoric-sdk/commit/437814cf6dc78ecb7ee878e574f121b29a1e761f))
* **xsnap:** Thread spawn and os into xsnap ([619a4de](https://github.com/Agoric/agoric-sdk/commit/619a4dee82a1e63d6b6708dcbb102fa2aced676e))
* **xsnap:** Update submodules for build and use CURDIR ([#2186](https://github.com/Agoric/agoric-sdk/issues/2186)) ([d0bf5cb](https://github.com/Agoric/agoric-sdk/commit/d0bf5cb4394f0d542020863e72c3eeacd705c3d7))


### Features

* use xsnap worker CPU meter and start reporting consumption ([62e0d5a](https://github.com/Agoric/agoric-sdk/commit/62e0d5a3b5ff32bd79567bab8fa1b63eb7f9134a))
* **swingset:** defaultManagerType option in makeSwingsetController ([#2266](https://github.com/Agoric/agoric-sdk/issues/2266)) ([b57f08f](https://github.com/Agoric/agoric-sdk/commit/b57f08f3514e052126a758f949acb5db3cc5a32d)), closes [#2260](https://github.com/Agoric/agoric-sdk/issues/2260)
* **swingset:** xsnap vat worker ([#2225](https://github.com/Agoric/agoric-sdk/issues/2225)) ([50c8548](https://github.com/Agoric/agoric-sdk/commit/50c8548e4d610e1e32537bc155e4c58d917cd6df)), closes [#2216](https://github.com/Agoric/agoric-sdk/issues/2216) [#2202](https://github.com/Agoric/agoric-sdk/issues/2202)
* **xs-vat-worker:** bootstrap SES shim on xsnap ([e775a99](https://github.com/Agoric/agoric-sdk/commit/e775a99afae43a8581cdeedd22545c7fa703c691))
* **xsnap:** Add interactive mode ([42912a7](https://github.com/Agoric/agoric-sdk/commit/42912a7c1d70cb67248f54f43b600165dbe7f624))
* **xsnap:** Add machinery for an xsrepl binary ([#2187](https://github.com/Agoric/agoric-sdk/issues/2187)) ([fc560d5](https://github.com/Agoric/agoric-sdk/commit/fc560d5ef9f77d85becd3c27edd820695900491f))
* **xsnap:** Add Node.js shell ([4491145](https://github.com/Agoric/agoric-sdk/commit/4491145cac1ab1d1a15b5b4b61a1c5a0cb975736))
* **xsnap:** Initial checkin from 34dfa4a ([f083df0](https://github.com/Agoric/agoric-sdk/commit/f083df0b791450eb28c2e43a69e3436f4b38d722))
* **xsnap:** Pivot terms from syscalls to commands ([3576b5c](https://github.com/Agoric/agoric-sdk/commit/3576b5cbd25c2dcbf0e94d5865c8b39e2cf2a1c7))
