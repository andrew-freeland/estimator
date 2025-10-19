"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useObjectState } from "@/hooks/use-object-state";
import { useFileUpload } from "@/hooks/use-presigned-upload";
import { cn } from "lib/utils";
import { ChevronLeft, Loader, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { safe } from "ts-safe";
import { UserZodSchema } from "app-types/user";
import {
  existsByEmailAction,
  signUpAction,
  signInAction,
} from "@/app/api/auth/actions";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function EmailSignUp({
  isFirstUser,
}: {
  isFirstUser: boolean;
}) {
  const t = useTranslations();
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { upload, isUploading } = useFileUpload();
  const [formData, setFormData] = useObjectState({
    // Basic auth info
    email: "",
    name: "",
    password: "",

    // Contractor profile info
    companyName: "",
    companySize: "",
    primaryLocation: "",
    serviceAreas: [] as string[],
    primaryTrade: "",
    specialties: [] as string[],
    projectTypes: [] as string[],
    yearsInBusiness: "",
    licenseNumber: "",
    interests: [] as string[],
    goals: "",
    website: "",
    phone: "",
    additionalInfo: "",
    laborPricingFile: "",
    materialPricingFile: "",
    pricingNotes: "",
  });

  const steps = [
    t("Auth.SignUp.step1"),
    t("Auth.SignUp.step2"),
    t("Auth.SignUp.step3"),
    "Company Information",
    "Location & Service Area",
    "Trade & Specialization",
    "Business Details",
    "Interests & Goals",
    "Pricing Information",
  ];

  const safeProcessWithLoading = function <T>(fn: () => Promise<T>) {
    setIsLoading(true);
    return safe(() => fn()).watch(() => setIsLoading(false));
  };

  const handleFileUpload = async (file: File, type: "labor" | "material") => {
    if (!file) return;

    // Validate file type
    const allowedTypes = [".pdf", ".xlsx", ".xls", ".csv"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      toast.error("Please upload a PDF, Excel, or CSV file");
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    const result = await upload(file);
    if (result) {
      if (type === "labor") {
        setFormData({ laborPricingFile: result.url });
      } else {
        setFormData({ materialPricingFile: result.url });
      }
      toast.success("File uploaded successfully");
    }
  };

  const backStep = () => {
    setStep(Math.max(step - 1, 1));
  };

  const successEmailStep = async () => {
    const { success } = UserZodSchema.shape.email.safeParse(formData.email);
    if (!success) {
      toast.error(t("Auth.SignUp.invalidEmail"));
      return;
    }
    const exists = await safeProcessWithLoading(() =>
      existsByEmailAction(formData.email),
    ).orElse(false);
    if (exists) {
      toast.error(t("Auth.SignUp.emailAlreadyExists"));
      return;
    }
    setStep(2);
  };

  const successNameStep = () => {
    const { success } = UserZodSchema.shape.name.safeParse(formData.name);
    if (!success) {
      toast.error(t("Auth.SignUp.nameRequired"));
      return;
    }
    setStep(3);
  };

  const successPasswordStep = async () => {
    // client side validation
    const { success: passwordSuccess, error: passwordError } =
      UserZodSchema.shape.password.safeParse(formData.password);
    if (!passwordSuccess) {
      const errorMessages = passwordError.issues.map((e) => e.message);
      toast.error(errorMessages.join("\n\n"));
      return;
    }

    // For now, proceed to contractor profile steps
    setStep(4);
  };

  const successContractorStep = async () => {
    // server side validation and admin user creation if first user
    const { success, message } = await safeProcessWithLoading(() =>
      signUpAction({
        email: formData.email,
        name: formData.name,
        password: formData.password,
        contractorProfile: {
          companyName: formData.companyName,
          companySize: formData.companySize,
          primaryLocation: formData.primaryLocation,
          serviceAreas: formData.serviceAreas,
          primaryTrade: formData.primaryTrade,
          specialties: formData.specialties,
          projectTypes: formData.projectTypes,
          yearsInBusiness: formData.yearsInBusiness
            ? parseInt(formData.yearsInBusiness)
            : undefined,
          licenseNumber: formData.licenseNumber,
          interests: formData.interests,
          goals: formData.goals,
          website: formData.website,
          phone: formData.phone,
          additionalInfo: formData.additionalInfo,
          pricingNotes: formData.pricingNotes,
        },
      }),
    ).unwrap();
    if (success) {
      toast.success(message);
      // Automatically sign in the user after successful registration
      try {
        await signInAction({
          email: formData.email,
          password: formData.password,
        });
        // Redirect to estimator chat after successful sign-in
        router.push("/estimator");
      } catch {
        // If auto sign-in fails, still redirect to estimator (user can sign in manually)
        router.push("/estimator");
      }
    } else {
      toast.error(message);
    }
  };

  return (
    <Card className="w-full md:max-w-md bg-background border-none mx-auto gap-0 shadow-none animate-in fade-in duration-1000">
      <CardHeader>
        <CardTitle className="text-2xl text-center ">
          {isFirstUser ? t("Auth.SignUp.titleAdmin") : t("Auth.SignUp.title")}
        </CardTitle>
        <CardDescription className="py-12">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground text-right">
              Step {step} of {steps.length}
            </p>
            <div className="h-2 w-full relative bg-input">
              <div
                style={{
                  width: `${(step / steps.length) * 100}%`,
                }}
                className="h-full bg-primary transition-all duration-300"
              ></div>
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {step === 1 && (
            <div className={cn("flex flex-col gap-2")}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="mcp@example.com"
                disabled={isLoading}
                autoFocus
                value={formData.email}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    e.nativeEvent.isComposing === false
                  ) {
                    successEmailStep();
                  }
                }}
                onChange={(e) => setFormData({ email: e.target.value })}
                required
              />
            </div>
          )}
          {step === 2 && (
            <div className={cn("flex flex-col gap-2")}>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Cgoing"
                disabled={isLoading}
                autoFocus
                value={formData.name}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    e.nativeEvent.isComposing === false
                  ) {
                    successNameStep();
                  }
                }}
                onChange={(e) => setFormData({ name: e.target.value })}
                required
              />
            </div>
          )}
          {step === 3 && (
            <div className={cn("flex flex-col gap-2")}>
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="********"
                disabled={isLoading}
                autoFocus
                value={formData.password}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    e.nativeEvent.isComposing === false
                  ) {
                    successPasswordStep();
                  }
                }}
                onChange={(e) => setFormData({ password: e.target.value })}
                required
              />
            </div>
          )}

          {/* Step 4: Company Information */}
          {step === 4 && (
            <div className={cn("flex flex-col gap-4")}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="ABC Construction LLC"
                  disabled={isLoading}
                  autoFocus
                  value={formData.companyName}
                  onChange={(e) => setFormData({ companyName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="companySize">Company Size</Label>
                <Select
                  value={formData.companySize}
                  onValueChange={(value) => setFormData({ companySize: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo Contractor</SelectItem>
                    <SelectItem value="small">
                      Small (2-10 employees)
                    </SelectItem>
                    <SelectItem value="medium">
                      Medium (11-50 employees)
                    </SelectItem>
                    <SelectItem value="large">
                      Large (51-200 employees)
                    </SelectItem>
                    <SelectItem value="enterprise">
                      Enterprise (200+ employees)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 5: Location & Service Area */}
          {step === 5 && (
            <div className={cn("flex flex-col gap-4")}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="primaryLocation">Primary Location</Label>
                <Input
                  id="primaryLocation"
                  type="text"
                  placeholder="City, State (e.g., Austin, TX)"
                  disabled={isLoading}
                  autoFocus
                  value={formData.primaryLocation}
                  onChange={(e) =>
                    setFormData({ primaryLocation: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Service Areas (optional)</Label>
                <Textarea
                  placeholder="List additional cities or regions you serve, separated by commas"
                  disabled={isLoading}
                  value={formData.serviceAreas.join(", ")}
                  onChange={(e) =>
                    setFormData({
                      serviceAreas: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          )}

          {/* Step 6: Trade & Specialization */}
          {step === 6 && (
            <div className={cn("flex flex-col gap-4")}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="primaryTrade">Primary Trade</Label>
                <Select
                  value={formData.primaryTrade}
                  onValueChange={(value) =>
                    setFormData({ primaryTrade: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your primary trade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Contractor</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="roofing">Roofing</SelectItem>
                    <SelectItem value="flooring">Flooring</SelectItem>
                    <SelectItem value="painting">Painting</SelectItem>
                    <SelectItem value="carpentry">Carpentry</SelectItem>
                    <SelectItem value="masonry">Masonry</SelectItem>
                    <SelectItem value="landscaping">Landscaping</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Project Types</Label>
                <div className="flex flex-col gap-2">
                  {[
                    "Residential",
                    "Commercial",
                    "Industrial",
                    "Renovation",
                    "New Construction",
                  ].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={`project-${type}`}
                        checked={formData.projectTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              projectTypes: [...formData.projectTypes, type],
                            });
                          } else {
                            setFormData({
                              projectTypes: formData.projectTypes.filter(
                                (t) => t !== type,
                              ),
                            });
                          }
                        }}
                      />
                      <Label htmlFor={`project-${type}`} className="text-sm">
                        {type}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Business Details */}
          {step === 7 && (
            <div className={cn("flex flex-col gap-4")}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="yearsInBusiness">Years in Business</Label>
                <Input
                  id="yearsInBusiness"
                  type="number"
                  placeholder="5"
                  disabled={isLoading}
                  autoFocus
                  value={formData.yearsInBusiness}
                  onChange={(e) =>
                    setFormData({ yearsInBusiness: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="licenseNumber">License Number (optional)</Label>
                <Input
                  id="licenseNumber"
                  type="text"
                  placeholder="State license number"
                  disabled={isLoading}
                  value={formData.licenseNumber}
                  onChange={(e) =>
                    setFormData({ licenseNumber: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone Number (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  disabled={isLoading}
                  value={formData.phone}
                  onChange={(e) => setFormData({ phone: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Step 8: Interests & Goals */}
          {step === 8 && (
            <div className={cn("flex flex-col gap-4")}>
              <div className="flex flex-col gap-2">
                <Label>What are you interested in? (optional)</Label>
                <div className="flex flex-col gap-2">
                  {[
                    "Cost Estimation",
                    "Project Management",
                    "Material Planning",
                    "Labor Optimization",
                    "Client Communication",
                    "Technology Integration",
                  ].map((interest) => (
                    <div key={interest} className="flex items-center space-x-2">
                      <Checkbox
                        id={`interest-${interest}`}
                        checked={formData.interests.includes(interest)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              interests: [...formData.interests, interest],
                            });
                          } else {
                            setFormData({
                              interests: formData.interests.filter(
                                (i) => i !== interest,
                              ),
                            });
                          }
                        }}
                      />
                      <Label
                        htmlFor={`interest-${interest}`}
                        className="text-sm"
                      >
                        {interest}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="goals">Goals (optional)</Label>
                <Textarea
                  id="goals"
                  placeholder="What do you hope to achieve with this platform?"
                  disabled={isLoading}
                  value={formData.goals}
                  onChange={(e) => setFormData({ goals: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Step 9: Pricing Information */}
          {step === 9 && (
            <div className={cn("flex flex-col gap-4")}>
              <div className="flex flex-col gap-2">
                <Label>Upload Pricing Documents (optional)</Label>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="laborPricing" className="text-sm">
                      Labor Pricing
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="laborPricing"
                        type="file"
                        accept=".pdf,.xlsx,.xls,.csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "labor");
                        }}
                        className="hidden"
                        disabled={isUploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document.getElementById("laborPricing")?.click()
                        }
                        className="flex items-center gap-2"
                        disabled={isUploading}
                      >
                        <Upload className="size-4" />
                        {isUploading
                          ? "Uploading..."
                          : formData.laborPricingFile
                            ? "File Uploaded"
                            : "Upload File"}
                      </Button>
                      {formData.laborPricingFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormData({ laborPricingFile: "" })}
                          disabled={isUploading}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="materialPricing" className="text-sm">
                      Material Pricing
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="materialPricing"
                        type="file"
                        accept=".pdf,.xlsx,.xls,.csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "material");
                        }}
                        className="hidden"
                        disabled={isUploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document.getElementById("materialPricing")?.click()
                        }
                        className="flex items-center gap-2"
                        disabled={isUploading}
                      >
                        <Upload className="size-4" />
                        {isUploading
                          ? "Uploading..."
                          : formData.materialPricingFile
                            ? "File Uploaded"
                            : "Upload File"}
                      </Button>
                      {formData.materialPricingFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setFormData({ materialPricingFile: "" })
                          }
                          disabled={isUploading}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pricingNotes">Pricing Notes (optional)</Label>
                <Textarea
                  id="pricingNotes"
                  placeholder="Any additional notes about your pricing structure or rates..."
                  disabled={isLoading}
                  value={formData.pricingNotes}
                  onChange={(e) =>
                    setFormData({ pricingNotes: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <p className="text-muted-foreground text-xs mb-6">
            {steps[step - 1]}
          </p>
          <div className="flex flex-row-reverse gap-2">
            <Button
              tabIndex={0}
              disabled={isLoading}
              className="w-1/2"
              onClick={() => {
                if (step === 1) successEmailStep();
                if (step === 2) successNameStep();
                if (step === 3) successPasswordStep();
                if (step >= 4 && step < 9) setStep(step + 1);
                if (step === 9) successContractorStep();
              }}
            >
              {step === 9 ? t("Auth.SignUp.createAccount") : t("Common.next")}
              {isLoading && <Loader className="size-4 ml-2" />}
            </Button>
            <Button
              tabIndex={step === 1 ? -1 : 0}
              disabled={isLoading || step === 1}
              className={cn(step === 1 && "invisible", "w-1/2")}
              variant="ghost"
              onClick={backStep}
            >
              <ChevronLeft className="size-4" />
              {t("Common.back")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
