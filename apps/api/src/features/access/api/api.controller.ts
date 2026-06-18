import { Request, Response } from "express";
import { ApiService } from "./api.service";
import { ApiResponse } from "../../../shared/utils/ApiResponse";
import { asyncHandler } from "../../../shared/utils/asyncHandler";

const apiService = new ApiService();

export class ApiController {
  createApiKey = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const creatorId = req.user!.id as string;
    const { name } = req.body;

    console.log(`[ApiController] createApiKey called for orgId: ${orgId} by creatorId: ${creatorId} name: ${name}`);
    const apiKey = await apiService.createApiKey(orgId, name, creatorId);
    console.log(`[ApiController] createApiKey success for keyId: ${apiKey.id}`);

    // Warning: The key is only returned once
    res.status(201).json(new ApiResponse(201, apiKey, "API Key created successfully. Store it safely, it won't be shown again."));
  });

  listApiKeys = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    console.log(`[ApiController] listApiKeys called for orgId: ${orgId}`);
    const keys = await apiService.listApiKeys(orgId);
    console.log(`[ApiController] listApiKeys success, found ${keys.length} keys`);
    res.status(200).json(new ApiResponse(200, keys, "API Keys fetched successfully"));
  });

  revokeApiKey = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const keyId = req.params.keyId as string;
    const revokerId = req.user!.id as string;

    console.log(`[ApiController] revokeApiKey called for orgId: ${orgId}, keyId: ${keyId} by revokerId: ${revokerId}`);
    await apiService.revokeApiKey(orgId, keyId, revokerId);
    console.log(`[ApiController] revokeApiKey success`);

    res.status(200).json(new ApiResponse(200, null, "API Key revoked successfully"));
  });
}
