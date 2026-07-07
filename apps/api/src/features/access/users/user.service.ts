import bcrypt from "bcrypt";
import { eq, and } from "drizzle-orm";

import { UserRepository } from "./user.repository";
import { CreateUserInput, UpdateUserInput, UpdatePasswordInput } from "./user.schema";
import { ApiError } from "@/shared/utils/ApiError";
import { db } from "@/db";
import { MembershipTable } from "@/db/membership.schema";
import { OrganizationTable } from "@/db/organization.schema";

export class UserService {
  constructor(private readonly userRepository = new UserRepository()) {}

  async createUser(input: CreateUserInput) {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new ApiError(409, "A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    return await this.userRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    });
  }

  async updateUser(id: string, input: UpdateUserInput) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return await this.userRepository.update(id, input);
  }

  async updatePassword(id: string, input: UpdatePasswordInput) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new ApiError(400, "Invalid current password");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    return await this.userRepository.update(id, { passwordHash } as any);
  }

  async getUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return user;
  }

  async getUserByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async deleteUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return await this.userRepository.delete(id);
  }

  async getInvitations(userId: string) {
    return db
      .select({
        membership: MembershipTable,
        organization: OrganizationTable,
      })
      .from(MembershipTable)
      .innerJoin(
        OrganizationTable,
        eq(MembershipTable.organizationId, OrganizationTable.id),
      )
      .where(
        and(
          eq(MembershipTable.userId, userId),
          eq(MembershipTable.status, "pending"),
        ),
      );
  }
}
