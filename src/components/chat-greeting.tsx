"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Calculator,
  Building2,
  Users,
  Hammer,
  Wrench,
  TrendingUp,
} from "lucide-react";
import { BBPLogo } from "./bbp-logo";

export const ChatGreeting = () => {
  const constructionGreetings = useMemo(() => {
    const greetings = [
      "Ready to build something amazing?",
      "Let's estimate your next project!",
      "What construction project can I help you with today?",
      "Time to crunch some numbers and build your success!",
      "Ready to turn your construction vision into reality?",
      "Let's calculate your way to project success!",
      "What's your next big build?",
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }, []);

  const quickActions = [
    { icon: Calculator, text: "Create New Estimate", color: "text-primary" },
    { icon: Building2, text: "Manage Vendors", color: "text-primary" },
    { icon: Users, text: "Track Labor Costs", color: "text-primary" },
    {
      icon: TrendingUp,
      text: "View Project Analytics",
      color: "text-primary",
    },
  ];

  return (
    <motion.div
      key="welcome"
      className="max-w-4xl mx-auto my-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.3, duration: 0.6 }}
    >
      <div className="rounded-2xl bg-card p-8 border border-border shadow-lg">
        {/* Animated Header */}
        <motion.div
          className="text-center mb-6"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Hammer className="w-8 h-8 text-primary" />
            </motion.div>
            <div className="flex items-center gap-3">
              <BBPLogo size="lg" className="text-primary" />
              <h1 className="text-3xl font-bold text-primary">
                Builder&apos;s Business Partner
              </h1>
            </div>
            <motion.div
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
                delay: 1,
              }}
            >
              <Wrench className="w-8 h-8 text-primary" />
            </motion.div>
          </div>

          <motion.p
            className="text-lg text-muted-foreground mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {constructionGreetings}
          </motion.p>
        </motion.div>

        {/* Quick Action Buttons */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          {quickActions.map((action, index) => (
            <motion.button
              key={action.text}
              className="group relative p-4 rounded-xl bg-card border border-border hover:border-primary hover:shadow-md transition-all duration-200"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + index * 0.1 }}
            >
              <div className="flex flex-col items-center gap-2">
                <action.icon
                  className={`w-6 h-6 ${action.color} group-hover:scale-110 transition-transform`}
                />
                <span className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors">
                  {action.text}
                </span>
              </div>
            </motion.button>
          ))}
        </motion.div>

        {/* Construction-themed info */}
        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <p className="text-sm text-muted-foreground">
            💡 <strong>Pro Tip:</strong> Start by describing your project, and
            I&apos;ll help you create a detailed estimate with materials, labor,
            and timeline.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};
