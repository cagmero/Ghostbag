import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { sepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";

export const REQUIRED_CHAIN_ID = sepolia.id; // 11155111

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    metaMask({
      dappMetadata: {
        name: "Ghostbag",
      },
      logging: { developerMode: false },
      infuraAPIKey: undefined,
      enableAnalytics: false,
    } as any),
  ],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  transports: {
    [sepolia.id]: http(
      "https://eth-sepolia.g.alchemy.com/v2/raKwmpU7756W7aFBEwrXj"
    ),
  },
});
