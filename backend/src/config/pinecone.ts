import { Pinecone } from "@pinecone-database/pinecone";

let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;

    if (!apiKey) {
      throw new Error("PINECONE_API_KEY environment variable is not set");
    }

    pineconeClient = new Pinecone({
      apiKey,
    });

    console.log("✅ Pinecone client initialized");
  }

  return pineconeClient;
}

export function getPineconeRegion(): string {
  return process.env.PINECONE_REGION || "us";
}
