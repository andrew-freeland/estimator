// @module: estimator_chat_api
// API endpoint for Estimator Assistant chat
// Handles chat requests and routes to appropriate agents

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { ingestionAgent } from "agents/ingestion_agent";
import { ratesAgent } from "agents/rates_agent";
import { explainerAgent } from "agents/explainer_agent";
import { vectorStoreService } from "vectorstore";
import { config } from "lib/config";
import logger from "lib/logger";

export async function POST(request: Request) {
  try {
    const { messages, threadId } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    logger.info(`Processing estimator chat request for thread ${threadId}`);

    // Extract client and job context from thread or message metadata
    const clientId = lastMessage.metadata?.clientId || "default";
    const jobId = lastMessage.metadata?.jobId;

    // Process the user's message
    const response = await processEstimatorMessage({
      message: lastMessage.content,
      clientId,
      jobId,
      threadId,
      messageHistory: messages,
    });

    // Stream the response
    return streamText({
      model: openai(config.aiConfig.explainerModel),
      messages: [
        {
          role: "system",
          content: `You are an expert construction estimator assistant. You help users with:
- Construction cost estimates and breakdowns
- Material and labor rate information
- Project timeline and scheduling
- Location-based cost modifiers
- File analysis and document processing

Always provide clear, actionable estimates with confidence levels and assumptions. Be helpful and professional.`,
        },
        ...messages.slice(-10), // Keep last 10 messages for context
        {
          role: "user",
          content: response,
        },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    });
  } catch (error) {
    logger.error("Error in estimator chat API:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

interface ProcessMessageParams {
  message: string;
  clientId: string;
  jobId?: string;
  threadId?: string;
  messageHistory: any[];
}

async function processEstimatorMessage({
  message,
  clientId,
  jobId,
  threadId,
  messageHistory,
}: ProcessMessageParams): Promise<string> {
  const content = message.toLowerCase();

  try {
    // Check if this is a rates/cost request
    if (content.includes('rate') || content.includes('cost') || content.includes('price')) {
      return await handleRatesRequest(message, clientId, jobId);
    }

    // Check if this is an estimate explanation request
    if (content.includes('explain') || content.includes('estimate') || content.includes('breakdown')) {
      return await handleEstimateRequest(message, clientId, jobId);
    }

    // Check if this is a file upload or document analysis request
    if (content.includes('upload') || content.includes('document') || content.includes('file')) {
      return await handleFileRequest(message, clientId, jobId);
    }

    // Default to general assistance with context search
    return await handleGeneralRequest(message, clientId, jobId, messageHistory);
  } catch (error) {
    logger.error("Error processing estimator message:", error);
    return "I apologize, but I encountered an error processing your request. Please try again or provide more specific details.";
  }
}

async function handleRatesRequest(message: string, clientId: string, jobId?: string): Promise<string> {
  try {
    const ratesData = await ratesAgent.getRates({
      clientId,
      jobId,
      location: extractLocation(message),
      categories: extractCategories(message),
    });

    if (ratesData.success && ratesData.data) {
      let response = "Here's the rate information I found:\n\n";
      
      if (ratesData.data.laborRates && ratesData.data.laborRates.length > 0) {
        response += "**Labor Rates:**\n";
        ratesData.data.laborRates.forEach((rate: any) => {
          response += `- ${rate.skill}: $${rate.hourlyRate}/hour`;
          if (rate.overtimeRate) {
            response += ` (overtime: $${rate.overtimeRate}/hour)`;
          }
          response += `\n`;
        });
        response += "\n";
      }
      
      if (ratesData.data.materialCosts && ratesData.data.materialCosts.length > 0) {
        response += "**Material Costs:**\n";
        ratesData.data.materialCosts.forEach((cost: any) => {
          response += `- ${cost.item}: $${cost.unitPrice}/${cost.unit}`;
          if (cost.supplier) {
            response += ` (${cost.supplier})`;
          }
          response += `\n`;
        });
        response += "\n";
      }
      
      if (ratesData.data.locationModifiers) {
        response += `**Location Modifiers:**\n`;
        response += `- Total modifier: ${(ratesData.data.locationModifiers.modifiers.total * 100).toFixed(1)}%\n`;
        response += `- Region: ${ratesData.data.locationModifiers.region}\n\n`;
      }
      
      response += "Would you like me to help you create a detailed estimate based on these rates?";
      
      return response;
    } else {
      return "I couldn't find specific rate information for your request. Please provide more details about the type of work, location, or specific materials you're interested in.";
    }
  } catch (error) {
    logger.error("Error handling rates request:", error);
    return "I encountered an error retrieving rate information. Please try again or provide more specific details.";
  }
}

async function handleEstimateRequest(message: string, clientId: string, jobId?: string): Promise<string> {
  try {
    const estimateData = await explainerAgent.explainEstimate({
      clientId,
      jobId,
      projectDescription: message,
      location: extractLocation(message),
    });

    if (estimateData.success && estimateData.data) {
      const { breakdown, uncertainty, narrative } = estimateData.data;
      
      let response = `**Project Estimate Breakdown**\n\n`;
      response += `Total Estimated Cost: $${breakdown.totalCost.toLocaleString()}\n`;
      response += `Overall Confidence: ${(breakdown.overallConfidence * 100).toFixed(1)}%\n\n`;
      
      response += `**Cost Categories:**\n`;
      breakdown.categories.forEach((category: any) => {
        response += `- ${category.name}: $${category.cost.toLocaleString()} (${(category.confidence * 100).toFixed(1)}% confidence)\n`;
      });
      
      if (uncertainty.riskFactors && uncertainty.riskFactors.length > 0) {
        response += `\n**Risk Factors:**\n`;
        uncertainty.riskFactors.forEach((risk: any) => {
          response += `- ${risk.factor}: ${risk.impact} impact (${(risk.probability * 100).toFixed(1)}% probability)\n`;
        });
      }
      
      if (uncertainty.missingData && uncertainty.missingData.length > 0) {
        response += `\n**Missing Information:**\n`;
        uncertainty.missingData.forEach((item: string) => {
          response += `- ${item}\n`;
        });
      }
      
      response += `\n**Detailed Analysis:**\n${narrative}`;
      
      return response;
    } else {
      return "I couldn't generate a detailed estimate. Please provide more information about your project, including scope, location, and any specific requirements.";
    }
  } catch (error) {
    logger.error("Error handling estimate request:", error);
    return "I encountered an error generating the estimate. Please provide more details about your project.";
  }
}

async function handleFileRequest(message: string, clientId: string, jobId?: string): Promise<string> {
  try {
    // Search for recently uploaded files in vector store
    const searchResults = await vectorStoreService.search({
      query: "recently uploaded files documents",
      clientId,
      jobId,
      limit: 5,
    });

    if (searchResults.length > 0) {
      let response = "I found the following documents in your project:\n\n";
      searchResults.forEach((result, index) => {
        response += `${index + 1}. ${result.source} (${(result.similarity * 100).toFixed(1)}% relevance)\n`;
      });
      
      response += "\nI can analyze these documents to help with your estimate. What specific information would you like me to extract or analyze?";
      
      return response;
    } else {
      return "I don't see any uploaded documents yet. You can upload project plans, specifications, or other relevant files, and I'll analyze them to help with your construction estimate.";
    }
  } catch (error) {
    logger.error("Error handling file request:", error);
    return "I encountered an error accessing your files. Please try uploading your documents again.";
  }
}

async function handleGeneralRequest(
  message: string, 
  clientId: string, 
  jobId?: string, 
  messageHistory: any[] = []
): Promise<string> {
  try {
    // Search for relevant information in vector store
    const searchResults = await vectorStoreService.search({
      query: message,
      clientId,
      jobId,
      limit: 5,
    });

    if (searchResults.length > 0) {
      const relevantContent = searchResults
        .map(result => result.content.substring(0, 200) + "...")
        .join('\n\n');
      
      return `Based on your project data, here's what I found:\n\n${relevantContent}\n\nWould you like me to help you with a specific estimate, cost breakdown, or analysis?`;
    } else {
      return `I'd be happy to help you with construction estimates! Here's what I can assist you with:

- **Cost Estimates**: Get detailed breakdowns for labor, materials, and equipment
- **Rate Information**: Access current market rates for different trades and materials
- **Project Analysis**: Analyze uploaded documents, plans, and specifications
- **Location Factors**: Account for regional cost differences and travel expenses
- **Timeline Planning**: Help with project scheduling and duration estimates

Please share your project details, upload any relevant documents, or ask me about specific costs, materials, or timelines.`;
    }
  } catch (error) {
    logger.error("Error handling general request:", error);
    return "I'd be happy to help you with construction estimates! Please share your project details or ask me about specific costs, materials, or timelines.";
  }
}

// Helper functions
function extractLocation(content: string): string | undefined {
  const locationMatch = content.match(/(?:in|at|near|location:?)\s+([^,.\n]+)/i);
  return locationMatch ? locationMatch[1].trim() : undefined;
}

function extractCategories(content: string): string[] {
  const categories = [];
  if (content.includes('labor') || content.includes('worker')) categories.push('Labor');
  if (content.includes('material') || content.includes('supply')) categories.push('Materials');
  if (content.includes('equipment') || content.includes('machine')) categories.push('Equipment');
  if (content.includes('overhead') || content.includes('admin')) categories.push('Overhead');
  return categories;
}
