// @module: estimator_page
// Estimator Assistant main page
// Demonstrates the new assistant-ui based chat interface

"use client";

import { useState } from "react";
import EstimatorChat from "@/components/estimator-chat";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calculator,
  FileText,
  MapPin,
  Clock,
  TrendingUp,
  Upload,
  MessageSquare,
} from "lucide-react";

export default function EstimatorPage() {
  return (
    <div className="flex h-screen">
      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col">
        <EstimatorChat className="flex-1" />
      </div>
    </div>
  );
}
