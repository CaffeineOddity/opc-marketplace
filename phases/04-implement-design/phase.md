---
phase: 04-implement-design
name: 实现设计
description: API 设计、数据库 schema、项目脚手架
order:
  prev: 03-design
  next: 05-implement
---

## 目标

将 03-design 的产品形态翻译为可被 05-implement 直接消费的工程契约：API 端点、数据库 schema、目录骨架、关键依赖选型。

## 职责

- 设计 RESTful / GraphQL / RPC 端点并冻结接口契约
- 设计数据库表结构、索引、迁移策略
- 搭建项目脚手架（目录、构建、Lint、基础配置）
- 输出 opc-knowledge 下的 api.md / schema.md / scaffold.md 以供 05-implement 节点 input 引用
- 不写业务代码（业务代码归 05-implement）
