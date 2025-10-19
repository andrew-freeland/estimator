# Estimator Assistant

Estimator Assistant is an AI-powered estimating companion for builders — developed by [Builder's Business Partner LLC](https://mybuilderbot.com).  
It helps contractors scope, price, and manage estimates faster and more confidently.

---

## 🚀 Overview
Estimator Assistant streamlines construction estimating by combining:
- Structured chat interface for project scoping  
- Automated cost breakdowns and template-based Excel output  
- Seamless integration with BuilderTrend, QuickBooks, and Google Cloud  

---

## 🧠 Tech Stack
- Next.js 15 + Tailwind CSS + shadcn/ui  
- PostgreSQL + Drizzle ORM  
- BetterAuth authentication  
- Dockerized Cloud Run deployment  
- Twilio + ElevenLabs voice integration

---

## 🧩 Key Features
- Voice-to-text scoping (English, Spanish, Romanian)
- Automatic follow-up questions for missing info  
- Excel estimate generation with dynamic categories  
- Company-specific pricing data ingestion  
- Learning feedback via re-uploaded estimates

---

## 🧰 Local Setup
```bash
pnpm install
pnpm dev
```

Populate `.env.local` following `.env.example`.
Requires PostgreSQL connection and valid BetterAuth credentials.

---

## 🧾 License & Attribution

This project includes modified portions of open-source code licensed under MIT.
Original work © 2024 respective authors.
Enhancements and integrations © 2025 Builder's Business Partner LLC.