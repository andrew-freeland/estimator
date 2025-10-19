"use server";

import { auth } from "@/lib/auth/server";
import { BasicUser, UserZodSchema } from "app-types/user";
import { userRepository, contractorProfileRepository } from "lib/db/repository";
import { ActionState } from "lib/action-utils";
import { headers } from "next/headers";

export async function existsByEmailAction(email: string) {
  const exists = await userRepository.existsByEmail(email);
  return exists;
}

type SignUpActionResponse = ActionState & {
  user?: BasicUser;
};

export async function signUpAction(data: {
  email: string;
  name: string;
  password: string;
  contractorProfile?: {
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
  };
}): Promise<SignUpActionResponse> {
  const { success, data: parsedData } = UserZodSchema.safeParse({
    email: data.email,
    name: data.name,
    password: data.password,
  });
  if (!success) {
    return {
      success: false,
      message: "Invalid data",
    };
  }
  try {
    const { user } = await auth.api.signUpEmail({
      body: {
        email: parsedData.email,
        password: parsedData.password,
        name: parsedData.name,
      },
      headers: await headers(),
    });

    // Create contractor profile if provided
    if (data.contractorProfile && user?.id) {
      await contractorProfileRepository.create({
        userId: user.id,
        ...data.contractorProfile,
      });
    }

    return {
      user,
      success: true,
      message: "Successfully signed up",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to sign up",
    };
  }
}

export async function signInAction(data: {
  email: string;
  password: string;
}): Promise<ActionState> {
  try {
    const { user } = await auth.api.signInEmail({
      body: {
        email: data.email,
        password: data.password,
      },
      headers: await headers(),
    });

    if (user) {
      return {
        success: true,
        message: "Successfully signed in",
      };
    } else {
      return {
        success: false,
        message: "Invalid credentials",
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to sign in",
    };
  }
}
