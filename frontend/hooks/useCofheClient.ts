"use client";

import { useState, useEffect, useRef } from "react";
import { useWalletClient, usePublicClient } from "wagmi";
import type { PublicClient, WalletClient } from "viem";

// Re-export types for consumers
export type CofheClient = {
  encryptInputs: (inputs: any[]) => { encrypt: () => Promise<any> };
  decryptHandle: (ctHash: bigint, utype: any) => { decrypt: () => Promise<any> };
  connected: boolean;
};

/**
 * Hook that initializes and returns a CoFHE SDK client instance.
 * Creates the client using @cofhe/sdk/web with the Sepolia chain config,
 * then connects it with the wallet and public clients from wagmi.
 */
export function useCofheClient() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [client, setClient] = useState<CofheClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function initClient() {
      if (!walletClient || !publicClient) {
        setClient(null);
        return;
      }

      // Prevent duplicate initialization
      if (initRef.current) return;
      initRef.current = true;

      setIsInitializing(true);
      setError(null);

      try {
        const { createCofhesdkConfig, createCofhesdkClient } = await import(
          "@cofhe/sdk/web"
        );
        const { sepolia } = await import("@cofhe/sdk/chains");

        const config = createCofhesdkConfig({
          supportedChains: [sepolia],
        });

        const cofheClient = createCofhesdkClient(config);

        const connectResult = await cofheClient.connect(
          publicClient as PublicClient,
          walletClient as WalletClient
        );

        if (!cancelled) {
          if (connectResult.success) {
            setClient(cofheClient as unknown as CofheClient);
          } else {
            setError(
              connectResult.error?.message ?? "Failed to connect CoFHE client"
            );
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to initialize CoFHE client");
          setClient(null);
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    }

    initClient();

    return () => {
      cancelled = true;
      initRef.current = false;
    };
  }, [walletClient, publicClient]);

  return { client, isInitializing, error };
}
