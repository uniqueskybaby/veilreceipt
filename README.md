# VeilReceipt · 零知识验收凭证

**看不见数据，也能验收交付。**

VeilReceipt 为 AI Agent 购买的数据服务生成可独立核验的交付凭证：Provider 签署内容承诺，买方对私密响应生成零知识证明，合约按订单规则执行付款或退款。

![VeilReceipt 项目介绍](docs/screenshots/story.png)

## 三个亮点

- **私密验收**：请求和响应留在本地，Noir 电路证明内容是否满足约定条件。
- **按约结算**：证明有效与交付合格分别判断；合格付款，过期或低质量交付生成有效的负面证明并退款。
- **凭证可携带**：导出承诺、Provider 签名、ZK 证明与结算记录，交给独立工具复验。修改公开结论、伪造来源、重复结算均有拒绝测试。

本仓库提供真实 Noir / UltraHonk 证明、Solidity 验证器、托管合约、本地 EVM、Agent 工具客户端和中文演示网站。数据为合成样本，资金为本地测试 ETH；真实 Provider、公共测试网和 ERC-8004 是后续接入方向。

第一次使用请阅读 [操作指南](docs/USER_GUIDE.zh-CN.md)；需要讲解原理或接手开发时，阅读与操作编号一一对应的 [操作背后的技术](docs/OPERATIONS_TECHNICAL.zh-CN.md)。

## 从源码启动

需要 Node.js 22.12+（推荐 Node 24）、npm、Git、tar；macOS 或 Linux，Windows 请使用 WSL。首次准备需要联网下载官方 Nargo 和公开 SRS。

```sh
git clone https://github.com/uniqueskybaby/veilreceipt.git
cd veilreceipt
npm ci
npm run bootstrap
npm test
npm run test:model
npm run build
npm start
```

打开 **http://127.0.0.1:4318/**。服务只监听本机。第一次准备好以后，可以使用已缓存 SRS 进行离线演示。

- `#/` 或 `#/lab`：付款、退款、凭证复验三幕真实演示。
- `#/story?chapter=1`：十章项目介绍；章节保存在 URL，可直接访问和刷新。
- `#/receipts`：公共凭证记录与导出。
- `#/protocol`：技术机制与当前部署。

开发前端使用 `npm run dev`；修改后运行 `npm run build`，再刷新生产预览。首次安装不要直接运行 `npm start`，必须先完成 bootstrap 和 build。

如已有 Nargo，可设置 `NARGO=/absolute/path/to/nargo npm run bootstrap`，版本要求为 **1.0.0-beta.19**。macOS 双击 `启动演示.command` 可启动已准备好的环境。

## 技术组成

| 部分 | 技术与作用 |
| --- | --- |
| 私密规则 | Noir 1.0.0-beta.19：标的一致、新鲜度、样本数量、置信度及价格字段约束 |
| 零知识证明 | bb.js 4.1.1 / UltraHonk，使用启用 ZK 的 `verifierTarget: evm` |
| 内容承诺 | Poseidon2，固定 schema 与随机盲因子，绑定请求、响应和订单 |
| 来源承诺 | EIP-712；签名在 Solidity 合约中验证 |
| 验证与资金 | Solidity 0.8.30 / OpenZeppelin；本地 Ganache EVM 执行真实交易 |
| 网页与服务 | React 19、Vite、Express；生成插画与原生可交互界面 |

架构与信任边界见 [技术说明](docs/ARCHITECTURE.zh-CN.md)，本次审阅和实际检查结果见 [发布审阅](docs/REVIEW.zh-CN.md)。

## Agent 调用与独立核验

启动服务后运行：

```sh
npm run agent -- valid
npm run agent -- stale
```

该确定性工具客户端演示 Agent 可调用的服务接口，并在 `artifacts/` 写入公共凭证。它不依赖 LLM 推理。

```sh
node scripts/verify-receipt.mjs artifacts/agent-receipt-1.json \
  http://127.0.0.1:4318/api/rpc YOUR_TRUSTED_ESCROW_ADDRESS
```

核验者须自行确认可信 RPC 与合约地址。本机部署地址位于 `.runtime/deployment.json`；外部文件不能替换核验工具的信任锚。

## 测试与恢复

```sh
npm test                 # 独立新链：真实证明、付款退款及对抗测试
npm run test:model       # UI 状态：避免把有效证明误当成合格交付
npm run test:stage       # 已运行服务与已有凭证：导入、篡改、信任锚检查
npm run test:rehearsal   # 已运行服务：三轮付款 / 退款 / 篡改 / 重放
VEIL_TEST_URL=http://127.0.0.1:4318 node --test tests/http.test.mjs # 已运行服务：只读接口与输入防护检查
```

协议测试使用独立链，不修改演示账本。演示链与部署保存在 `.runtime`，不要为了更新 UI 删除此目录。服务重启会恢复公共运行记录；内存中的私密合成样本不持久化。中断订单可以通过页面的“演示到期退款”处理。

生成的编译结果、SRS、本地账本、凭证记录、依赖目录和设计探索归档不上传 GitHub；新机器通过 bootstrap 重新生成运行环境。

## 安全范围

这是**本地研究与黑客松原型**。Provider 签名建立来源承诺，不证明现实世界数据天然真实；买方提交结算，不是完整的原子公平交换协议。合约未经过独立安全审计，不用于真实资金。

Ganache 已停止维护，其捆绑依赖仍有已知审计告警。本轮已升级其他可修复依赖，剩余情况与使用边界见 [SECURITY.md](SECURITY.md)。公开源码不等于公开运行服务；不要将本机服务、开发钱包或私密接口暴露到公网。

## 许可与参考

原创代码采用 [MIT](LICENSE)。第三方代码、字体与生成验证器保留原许可，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。

工程接法参考 [Noir Solidity example](https://github.com/noir-lang/noir-examples/tree/master/solidity-example)。概念参考 [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)、[zkPass ATN](https://reputation.zkpass.org/docs) 与 [ZKCP](https://bitcoincore.org/en/2016/02/26/zero-knowledge-contingent-payments-announcement/)；不代表已完成这些协议的集成。
