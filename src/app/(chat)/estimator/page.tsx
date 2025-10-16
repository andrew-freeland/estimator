// @module: estimator_page
// Estimator Assistant main page
// Demonstrates the new assistant-ui based chat interface

"use client";

import { useState } from "react";
import EstimatorChat from "components/estimator-chat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "ui/card";
import { Button } from "ui/button";
import { Badge } from "ui/badge";
import { 
  Calculator, 
  FileText, 
  MapPin, 
  Clock, 
  TrendingUp,
  Upload,
  MessageSquare
} from "lucide-react";

export default function EstimatorPage() {
  const [activeTab, setActiveTab] = useState<"chat" | "features">("chat");

  const features = [
    {
      icon: Calculator,
      title: "Cost Estimation",
      description: "Get detailed cost breakdowns for labor, materials, and equipment with confidence levels and assumptions.",
    },
    {
      icon: FileText,
      title: "Document Analysis",
      description: "Upload and analyze construction plans, specifications, and project documents automatically.",
    },
    {
      icon: MapPin,
      title: "Location Intelligence",
      description: "Account for regional cost differences, travel expenses, and local market conditions.",
    },
    {
      icon: Clock,
      title: "Timeline Planning",
      description: "Estimate project duration and create realistic schedules based on historical data.",
    },
    {
      icon: TrendingUp,
      title: "Market Rates",
      description: "Access current labor rates, material costs, and equipment pricing from multiple sources.",
    },
    {
      icon: Upload,
      title: "Voice Notes",
      description: "Record voice notes and get automatic transcription for quick project documentation.",
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Estimator Assistant</h1>
          <p className="text-sm text-gray-600 mt-1">
            AI-powered construction cost estimation
          </p>
        </div>

        <div className="flex-1 p-6">
          <div className="space-y-4">
            <Button
              variant={activeTab === "chat" ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("chat")}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat Assistant
            </Button>
            <Button
              variant={activeTab === "features" ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("features")}
            >
              <Calculator className="w-4 h-4 mr-2" />
              Features
            </Button>
          </div>

          {activeTab === "features" && (
            <div className="mt-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Quick Actions</h3>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Documents
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Calculator className="w-4 h-4 mr-2" />
                  New Estimate
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  View Rates
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-2">
              <span>Status</span>
              <Badge variant="secondary" className="text-xs">
                Online
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Model</span>
              <span className="font-mono">GPT-4o</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {activeTab === "chat" ? (
          <EstimatorChat className="flex-1" />
        ) : (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Estimator Assistant Features
                </h2>
                <p className="text-lg text-gray-600">
                  Transform your construction estimating process with AI-powered tools and insights.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {features.map((feature, index) => (
                  <Card key={index} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <feature.icon className="w-5 h-5 text-blue-600" />
                        </div>
                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-gray-600">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                  <CardDescription>
                    Here's how to use the Estimator Assistant effectively
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      1
                    </div>
                    <div>
                      <h4 className="font-semibold">Upload Your Documents</h4>
                      <p className="text-sm text-gray-600">
                        Upload construction plans, specifications, or any project documents for analysis.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      2
                    </div>
                    <div>
                      <h4 className="font-semibold">Describe Your Project</h4>
                      <p className="text-sm text-gray-600">
                        Tell us about your project scope, location, timeline, and any specific requirements.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      3
                    </div>
                    <div>
                      <h4 className="font-semibold">Get Your Estimate</h4>
                      <p className="text-sm text-gray-600">
                        Receive detailed cost breakdowns with confidence levels, assumptions, and recommendations.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
