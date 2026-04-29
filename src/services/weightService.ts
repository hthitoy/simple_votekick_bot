// src/services/weightService.ts
import { UsersRepo } from '../db/usersRepo';
import { DbUser } from '../types';

export class WeightService {
  constructor(private usersRepo: UsersRepo) {}

  /**
   * Update user weight using the decay + activity formula:
   * W_new = W_old * 0.75^d + log(1 + Δt)
   * d = days since last update
   * Δt = seconds since last message
   */
  async updateUserWeight(
    chatId: string,
    userId: string,
    username: string | null,
    firstName: string | null
  ): Promise<DbUser> {
    const now = Math.floor(Date.now() / 1000);

    let user = await this.usersRepo.getUser(chatId, userId);
    if (!user) {
      user = await this.usersRepo.upsertUser(chatId, userId, username, firstName);
      return user;
    }

    const lastUpdate = user.last_weight_update_at ?? user.joined_at;
    const lastMessage = user.last_message_at ?? user.joined_at;

    // d = days since last weight update
    const daysSinceUpdate = (now - lastUpdate) / 86400;

    // Δt = seconds since last message
    const secondsSinceMessage = (now - lastMessage) / 60;

    // W_new = W_old * 0.70^d + log(1 + Δt)
    const decayFactor = Math.pow(0.70, daysSinceUpdate);
    const activityBonus = Math.log(1 + secondsSinceMessage);
    const newWeight = Math.max(0.1, user.weight * decayFactor + activityBonus);

    // Update username/first_name too
    await this.usersRepo.upsertUser(chatId, userId, username, firstName);
    await this.usersRepo.updateWeight(chatId, userId, newWeight, now);

    return (await this.usersRepo.getUser(chatId, userId))!;
  }

  /**
   * Calculate vote power from weight:
   * vote_power = sqrt(W)
   */
  calculateVotePower(weight: number): number {
    return Math.sqrt(Math.max(0, weight));
  }

  /**
   * Get or initialize a user without updating their weight
   * (used when reading vote power for voting)
   */
  async getUserWeight(chatId: string, userId: string): Promise<number> {
    const user = await this.usersRepo.getUser(chatId, userId);
    return user?.weight ?? 1.0;
  }
}
