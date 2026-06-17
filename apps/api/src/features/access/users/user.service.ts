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
}
