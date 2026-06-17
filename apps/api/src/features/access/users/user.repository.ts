import { db } from "@/db/index";
import { UserTable, NewUser } from "@/db/user.schema";
import { eq } from "drizzle-orm";

export class UserRepository {
  async create(user: NewUser) {
    const [createdUser] = await db.insert(UserTable).values(user).returning();

    return createdUser;
  }

  async findById(id: string) {
    return db.query.UserTable.findFirst({
      where: eq(UserTable.id, id),
    });
  }

  async findByEmail(email: string) {
    return db.query.UserTable.findFirst({
      where: eq(UserTable.email, email),
    });
  }

  async update(id: string, values: Partial<NewUser>) {
    const [updatedUser] = await db
      .update(UserTable)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(UserTable.id, id))
      .returning();

    return updatedUser;
  }

  async delete(id: string) {
    const [user] = await db
      .update(UserTable)
      .set({
        status: "deleted",
        updatedAt: new Date(),
      })
      .where(eq(UserTable.id, id))
      .returning();

    return user;
  }
}
