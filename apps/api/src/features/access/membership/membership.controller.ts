import { Request, Response } from "express";
import { MembershipService } from "./membership.service";
import { ApiResponse } from "../../../shared/utils/ApiResponse";
import { asyncHandler } from "../../../shared/utils/asyncHandler";

const membershipService = new MembershipService();

export class MembershipController {
  addMember = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const inviterId = req.user!.id as string;
    console.log(`[MembershipController] addMember called for orgId: ${orgId} by inviterId: ${inviterId} with body:`, req.body);
    const membership = await membershipService.addMember(orgId, inviterId, req.body);
    console.log(`[MembershipController] addMember success for user: ${membership.userId}`);
    res.status(201).json(new ApiResponse(201, membership, "Member added successfully"));
  });

  getMembers = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    console.log(`[MembershipController] getMembers called for orgId: ${orgId}`);
    const members = await membershipService.getMembers(orgId);
    console.log(`[MembershipController] getMembers success, found ${members.length} members`);
    res.status(200).json(new ApiResponse(200, members, "Members fetched successfully"));
  });

  removeMember = asyncHandler(async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const targetUserId = req.params.userId as string;
    const removerId = req.user!.id as string;
    console.log(`[MembershipController] removeMember called for orgId: ${orgId}, targetUserId: ${targetUserId} by removerId: ${removerId}`);
    await membershipService.removeMember(orgId, targetUserId, removerId);
    console.log(`[MembershipController] removeMember success`);
    res.status(200).json(new ApiResponse(200, null, "Member removed successfully"));
  });
}
