import { eq } from "drizzle-orm";
import { db } from "../db.pg";
import {
  ContractorProfileTable,
  type ContractorProfileEntity,
} from "../schema.pg";

export const pgContractorProfileRepository = {
  async create(data: {
    userId: string;
    companyName?: string;
    companySize?: string;
    primaryLocation?: string;
    serviceAreas?: string[];
    primaryTrade?: string;
    specialties?: string[];
    projectTypes?: string[];
    yearsInBusiness?: number;
    licenseNumber?: string;
    interests?: string[];
    goals?: string;
    website?: string;
    phone?: string;
    additionalInfo?: string;
    pricingNotes?: string;
    laborPricingFile?: string;
    materialPricingFile?: string;
  }): Promise<ContractorProfileEntity> {
    const [profile] = await db
      .insert(ContractorProfileTable)
      .values({
        userId: data.userId,
        companyName: data.companyName,
        companySize: data.companySize as any,
        primaryLocation: data.primaryLocation,
        serviceAreas: data.serviceAreas || [],
        primaryTrade: data.primaryTrade,
        specialties: data.specialties || [],
        projectTypes: data.projectTypes || [],
        yearsInBusiness: data.yearsInBusiness,
        licenseNumber: data.licenseNumber,
        interests: data.interests || [],
        goals: data.goals,
        website: data.website,
        phone: data.phone,
        additionalInfo: data.additionalInfo,
        pricingNotes: data.pricingNotes,
        laborPricingFile: data.laborPricingFile,
        materialPricingFile: data.materialPricingFile,
        isComplete: true,
      })
      .returning();

    return profile;
  },

  async findByUserId(userId: string): Promise<ContractorProfileEntity | null> {
    const [profile] = await db
      .select()
      .from(ContractorProfileTable)
      .where(eq(ContractorProfileTable.userId, userId))
      .limit(1);

    return profile || null;
  },

  async update(
    userId: string,
    data: Partial<{
      companyName: string;
      companySize: string;
      primaryLocation: string;
      serviceAreas: string[];
      primaryTrade: string;
      specialties: string[];
      projectTypes: string[];
      yearsInBusiness: number;
      licenseNumber: string;
      interests: string[];
      goals: string;
      website: string;
      phone: string;
      additionalInfo: string;
      pricingNotes: string;
      laborPricingFile: string;
      materialPricingFile: string;
    }>,
  ): Promise<ContractorProfileEntity | null> {
    const [profile] = await db
      .update(ContractorProfileTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(ContractorProfileTable.userId, userId))
      .returning();

    return profile || null;
  },

  async delete(userId: string): Promise<void> {
    await db
      .delete(ContractorProfileTable)
      .where(eq(ContractorProfileTable.userId, userId));
  },
};
