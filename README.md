# eden-goldsky-redstone-demo
A demo of a RedStone oracle on Eden testnet being indexed by Goldsky for GraphQL API access.

If your endpoint returns `Type \`Query\` has no field \`valueUpdates\``, the subgraph was deployed
with a proxy/upgrade ABI instead of the adapter `ValueUpdate` ABI.
