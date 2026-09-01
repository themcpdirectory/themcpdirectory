import { z } from "zod";
import {
  createCollectionResponseSchema,
  createResourceResponseSchema,
  httpUrlSchema,
  slugSchema,
  strictObject,
} from "./shared.js";
import { serverSummaryServerSchema, supportedClientIdSchema } from "./servers.js";

const categorySummarySchema = strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  serverCount: z.number().int().nonnegative(),
});

export const categoriesCollectionResponseSchema =
  createCollectionResponseSchema(categorySummarySchema);
export type PublicCategorySummary = z.infer<
  typeof categoriesCollectionResponseSchema
>["data"][number];

export const categoryDetailResponseSchema = createResourceResponseSchema(
  strictObject({
    category: strictObject({
      slug: slugSchema,
      name: z.string().min(1),
      description: z.string().nullable(),
    }),
    servers: z.array(serverSummaryServerSchema),
    nextCursor: z.string().nullable(),
  }),
);
export type PublicCategoryDetail = z.infer<typeof categoryDetailResponseSchema>["data"];

export const publisherDetailResponseSchema = createResourceResponseSchema(
  strictObject({
    publisher: strictObject({
      slug: slugSchema,
      name: z.string().min(1),
      verified: z.boolean(),
      websiteUrl: httpUrlSchema.nullable(),
    }),
    servers: z.array(serverSummaryServerSchema),
    nextCursor: z.string().nullable(),
  }),
);
export type PublicPublisherDetail = z.infer<typeof publisherDetailResponseSchema>["data"];

const clientSummarySchema = strictObject({
  id: supportedClientIdSchema,
  name: z.string().min(1),
  capabilities: strictObject({
    deeplink: z.boolean(),
    stdio: z.boolean(),
    streamableHttp: z.boolean(),
    headers: z.boolean(),
    environmentVariables: z.boolean(),
    remoteVariables: z.boolean(),
  }),
  serverCount: z.number().int().nonnegative(),
});

export const clientsCollectionResponseSchema = createCollectionResponseSchema(clientSummarySchema);
export type PublicClientSummary = z.infer<typeof clientsCollectionResponseSchema>["data"][number];

export const clientDetailResponseSchema = createResourceResponseSchema(
  strictObject({
    client: clientSummarySchema.omit({ serverCount: true }),
    servers: z.array(serverSummaryServerSchema),
    nextCursor: z.string().nullable(),
  }),
);
export type PublicClientDetail = z.infer<typeof clientDetailResponseSchema>["data"];