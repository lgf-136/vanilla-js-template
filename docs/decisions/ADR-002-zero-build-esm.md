# ADR-002: 不打包，走原生 ESM + 懒加载

- 状态：已采纳
- 日期：2025-01

## 背景
体积与延迟是第一等公民（预算见 ARCHITECTURE.md 4.8 节：首屏 JS ≤ 40KB gzip，单模块 ≤ 15KB gzip）。

## 决策
开发与生产都不引入打包器：原生 ESM + Import Map，模块按路由懒加载
（`app/modules/registry.js` 的 `loadRoot()` 动态 `import()`）。

## 理由
- 避免引入打包器依赖（ESBuild/Rollup/Webpack 均属于第三方依赖）；
- 懒加载天然按模块拆分产物，直接服务于体积预算；
- 语言包随模块懒加载一并拉取，不预加载全部语言。

## 后果
- 生产构建 `scripts/build.js` 只做"文件指纹（?v=hash）+ 极简手写压缩"，不做打包与改名，
  保证动态 `import()` 的相对路径在 dist 中依然有效；
- 体积预算由 `just build-budget` 静态统计 gzip 后强制执行（CI）。