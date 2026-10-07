# 技术结构

## 一笔交付的路径

1. 买方锁定 Provider、请求承诺、验收规则、截止时间与托管款。
2. Provider 返回私密响应，并用 EIP-712 签署订单及请求/响应承诺。
3. 本地 prover 重算 Poseidon2 承诺，并证明响应是否满足规则。
4. 合约验签，从订单存储组装八个公开输入，调用 UltraHonk verifier。
5. 有效证明且验收合格：付款给 Provider；有效证明但不合格：退款买方。
6. 无证明的订单到期后可退款，但不产生 Provider 违约凭证。
7. 公共凭证携带证明和交易定位信息，核验者从可信部署重新检查。

## 代码位置

- `circuits/schema`：固定承诺 schema 与验收规则。
- `circuits/receipt`：承诺一致性、输入范围、验收布尔结果的电路。
- `circuits/commitments`：复用 schema 计算承诺，避免跨语言编码漂移。
- `contracts/ReceiptEscrow.sol`：固定规则、签名验证、证明验证、防重放与结算。
- `contracts/Verifier.sol`：bb.js 生成的验证器；bootstrap 会重新生成。
- `server/prover.mjs`：Noir witness 与 UltraHonk ZK 证明。
- `server/protocol.mjs`：Provider / 买方的参考编排。
- `server/verify.mjs`：公共凭证的八组核验。
- `server/index.mjs`：仅本机 HTTP 服务与只读 RPC 白名单。
- `src/components`：真实演示、十章介绍、凭证列表及技术说明。

公开输入依次为 `orderId`、`requestCommitment`、`responseCommitment`、`referenceTime`、`maxAge`、`minSamples`、`minConfidence`、`outcome`。验收规则由合约订单存储提供，提交者不能用自己的政策替代。

## 具体规则

响应标的必须等于请求标的；观察时间不晚于订单参考时间，且不超过最大允许年龄；样本数量与置信度达到阈值，置信度不超过 10000 bps，价格大于零。新鲜度相对订单创建时间计算，不是结算时的墙上时间。

Provider 对这些结构化字段的承诺签名。样本数与置信度是 Provider 声明的字段，电路不重新统计外部原始数据。

## 隐私与信任

- 隐藏：标的、行情响应字段、随机盲因子。公开：双方地址、政策、金额、时间、承诺、证明和结果。
- 本地参考进程同时扮演买方、Provider 与 prover，因此进程运营者知道原始数据。`/api/private/:id` 是按需打开的本机合成数据视图，不是生产权限系统。
- 公共凭证核验固定可信链和合约，不信任凭证自报地址。独立工具从可信 escrow 读取 verifier 地址。
- 买方拿到内容却拒绝提交证明仍是公平交换问题；当前不提供自动罚没、抗女巫信誉或真实商业 SLA 保证。

## 运行和持久化

服务只绑定 127.0.0.1，校验 Host 与 Origin。RPC 只允许读方法，不暴露发送交易、解锁账户或推进时钟接口；本地演示到期退款是单独的明确操作。

公共状态采用写临时文件后重命名的方式保存，减少写入中断截断原始状态的风险。私密样本仅存在于进程内存。本地 EVM 钱包使用公开开发助记词，不能存入真实资金。
