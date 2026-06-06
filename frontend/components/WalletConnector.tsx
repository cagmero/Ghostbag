"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { REQUIRED_CHAIN_ID } from "@/lib/wagmi-config";

export interface WalletState {
  isConnected: boolean;
  isCorrectNetwork: boolean;
  address: `0x${string}` | undefined;
}

/**
 * Hook providing wallet connection state for consumption by other components.
 */
export function useWalletState(): WalletState {
  const { address, isConnected, chainId } = useAccount();
  const isCorrectNetwork = chainId === REQUIRED_CHAIN_ID;

  return {
    isConnected,
    isCorrectNetwork: isConnected && isCorrectNetwork,
    address,
  };
}

/**
 * WalletConnector component using RainbowKit's ConnectButton.
 * Handles wallet connection, network switching, and account display.
 */
export function WalletConnector() {
  return <ConnectButton />;
}
