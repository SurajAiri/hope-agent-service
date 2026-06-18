import bcrypt from "bcrypt";

import { UserRepository } from "./user.repository";
import { CreateUserInput, UpdateUserInput } from "./user.schema";

export class UserService {
  constructor(private readonly userRepository = new UserRepository()) {}

  async createUser(input: CreateUserInput) {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new Error("User already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    return user;
  }

  async updateUser(id: string, input: UpdateUserInput) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new Error("User not found");
    }

    return await this.userRepository.update(id, input);
  }

  async getUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  async getUserByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async deleteUser(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new Error("User not found");
    }

    return await this.userRepository.delete(id);
  }

  async getInvitations(userId: string) {
    // using db directly for simplicity, requiring import
    const { db } = await import("../../../db/index");
    const { MembershipTable } = await import("../../../db/membership.schema");
    const { OrganizationTable } = await import("../../../db/organization.schema");
    const { eq, and } = await import("drizzle-orm");

    const invites = await db
      .select({
        membership: MembershipTable,
        organization: OrganizationTable,
      })
      .from(MembershipTable)
      .innerJoin(OrganizationTable, eq(MembershipTable.organizationId, OrganizationTable.id))
      .where(
        and(
          eq(MembershipTable.userId, userId),
          eq(MembershipTable.status, "pending")
        )
      );

    return invites;
  }
}
