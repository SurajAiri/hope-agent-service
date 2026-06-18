import { Request, Response } from "express";
import { OrganizationService } from "./organization.service";
import { ApiResponse } from "../../../shared/utils/ApiResponse";
import { asyncHandler } from "../../../shared/utils/asyncHandler";

const organizationService = new OrganizationService();

export class OrganizationController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[OrganizationController] create called by userId: ${userId} with body:`, req.body);
    const org = await organizationService.createOrganization(userId, req.body);
    console.log(`[OrganizationController] create success for orgId: ${org.id}`);
    res.status(201).json(new ApiResponse(201, org, "Organization created successfully"));
  });

  getAll = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as string;
    console.log(`[OrganizationController] getAll called by userId: ${userId}`);
    const orgs = await organizationService.getMyOrganizations(userId);
    console.log(`[OrganizationController] getAll success, found ${orgs.length} orgs`);
    res.status(200).json(new ApiResponse(200, orgs, "Organizations fetched successfully"));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const orgId = (req.params.organizationId as string) || req.organizationId!;
    console.log(`[OrganizationController] getById called for orgId: ${orgId}`);
    const org = await organizationService.getOrganizationById(orgId);
    res.status(200).json(new ApiResponse(200, org, "Organization fetched successfully"));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const orgId = (req.params.organizationId as string) || req.organizationId!;
    console.log(`[OrganizationController] update called for orgId: ${orgId} with body:`, req.body);
    const org = await organizationService.updateOrganization(orgId, req.body);
    console.log(`[OrganizationController] update success for orgId: ${orgId}`);
    res.status(200).json(new ApiResponse(200, org, "Organization updated successfully"));
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const orgId = (req.params.organizationId as string) || req.organizationId!;
    const userId = req.user!.id as string;
    console.log(`[OrganizationController] delete called for orgId: ${orgId} by userId: ${userId}`);
    await organizationService.deleteOrganization(orgId, userId);
    console.log(`[OrganizationController] delete success for orgId: ${orgId}`);
    res.status(200).json(new ApiResponse(200, null, "Organization deleted successfully"));
  });
}
