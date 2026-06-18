import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "@/db";
import { UserTable } from "@/db/user.schema";
import { OrganizationTable } from "@/db/organization.schema";
import { MembershipTable } from "@/db/membership.schema";
import { ApiError } from "@/shared/utils/ApiError";
import { eq } from "drizzle-orm";
import { registerSchema, loginSchema } from "./auth.validation";
import { z } from "zod";

export class AuthService {
  async register(input: z.infer<typeof registerSchema>) {
    const existingUser = await db.query.UserTable.findFirst({
      where: eq(UserTable.email, input.email),
    });

    if (existingUser) {
      throw new ApiError(409, "User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    return await db.transaction(async (tx) => {
      // 1. Create User
      const [user] = await tx
        .insert(UserTable)
        .values({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
        })
        .returning();

      // 2. Create Default Organization
      const orgName = `${input.firstName}'s Workspace`;
      const [org] = await tx
        .insert(OrganizationTable)
        .values({
          name: orgName,
          slug: `${input.firstName.toLowerCase()}-${Date.now()}`,
          createdBy: user.id,
        })
        .returning();

      // 3. Create Membership (Owner)
      await tx.insert(MembershipTable).values({
        userId: user.id,
        organizationId: org.id,
        role: "owner",
        createdBy: user.id,
      });

      const token = this.generateToken(user.id);

      return { user, token, organization: org };
    });
  }

  async login(input: z.infer<typeof loginSchema>) {
    const user = await db.query.UserTable.findFirst({
      where: eq(UserTable.email, input.email),
    });

    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid email or password");
    }

    if (user.status !== "active") {
      throw new ApiError(403, `User account is ${user.status}`);
    }

    const token = this.generateToken(user.id);

    return { user, token };
  }

  private generateToken(userId: string) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET as string, {
      expiresIn: "1d",
    });
  }
}
