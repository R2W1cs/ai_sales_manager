import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit comporter au moins 10 caractères.")
  .max(128, "Le mot de passe ne doit pas dépasser 128 caractères.");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Veuillez renseigner votre nom complet.")
  .max(100, "Le nom ne doit pas dépasser 100 caractères.");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "L'adresse email est requise.")
  .email("Veuillez saisir une adresse email valide.");
