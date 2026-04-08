import axios, { AxiosInstance } from "axios";

let evolutionClient: AxiosInstance | null = null;

export function getEvolutionClient(): AxiosInstance {
  if (!evolutionClient) {
    const baseURL = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!baseURL) {
      throw new Error("EVOLUTION_API_URL environment variable is not set");
    }

    evolutionClient = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { apikey: apiKey }),
      },
    });

    // Response interceptor for error handling
    evolutionClient.interceptors.response.use(
      (response) => response,
      (error) => {
        const data = error.response?.data;
        console.error("Evolution API error:", {
          url: error.config?.url,
          status: error.response?.status,
          data:
            data && typeof data === "object"
              ? JSON.stringify(data)
              : data,
        });
        return Promise.reject(error);
      },
    );

    console.log("✅ Evolution API client initialized");
  }

  return evolutionClient;
}

export function getEvolutionBaseUrl(): string {
  return process.env.EVOLUTION_API_URL || "";
}

export function getWebhookBaseUrl(): string {
  return (
    process.env.WEBHOOK_BASE_URL ||
    `http://localhost:${process.env.PORT || 3001}`
  );
}
