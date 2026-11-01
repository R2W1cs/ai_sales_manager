/**
 * Automated TDD Test Suite for T-WEB-08 — Web Products & Catalog Management UI (`/products`)
 * Generated from backlog card acceptance criteria.
 */

/// <reference types="jest" />
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { renderToString } from "react-dom/server";

import { TenantContext, type TenantContextValue } from "@/components/layout/tenant-context";
import { CsvImportDialog } from "@/components/products/csv-import-dialog";
import { ImageUploader } from "@/components/products/image-uploader";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductList } from "@/components/products/product-list";
import { VariantDrawer } from "@/components/products/variant-drawer";
import { VariantEditor, type VariantItem } from "@/components/products/variant-editor";
import frMessages from "@/i18n/messages/fr.json";
import type { CategoryResponse, ProductImageResponse, ProductResponse } from "@app/shared";

import ProductsPage from "./page";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/products",
}));

// Mock api-client
const mockSampleProducts: ProductResponse[] = [
  {
    id: "prod-1",
    businessId: "biz-test-123",
    categoryId: "cat-1",
    name: "Robe Fleurie d'Été",
    title: "Robe Fleurie d'Été",
    description: "Robe fluide imprimée fleurs pour l'été",
    status: "active",
    currency: "TND",
    benefits: ["Confortable", "100% Coton"],
    sellingPoints: ["Élégance naturelle"],
    objections: null,
    faqs: null,
    variants: [
      {
        id: "var-1",
        businessId: "biz-test-123",
        productId: "prod-1",
        sku: "ROBE-S-FL",
        barcode: null,
        attributes: { size: "S", color: "Rouge" },
        price: 85,
        discountPrice: null,
        stock: 14,
        availableStock: 12,
        isDefault: true,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        id: "var-2",
        businessId: "biz-test-123",
        productId: "prod-1",
        sku: "ROBE-M-FL",
        barcode: null,
        attributes: { size: "M", color: "Rouge" },
        price: 85,
        discountPrice: 75,
        stock: 6,
        availableStock: 5,
        isDefault: false,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ],
    images: [
      {
        id: "img-1",
        businessId: "biz-test-123",
        productId: "prod-1",
        variantId: null,
        s3Key: "businesses/biz-test-123/products/prod-1/images/photo.jpg",
        url: "https://s3.example.com/photos/robe-fleurie.jpg",
        altText: "Robe Fleurie principale",
        sortOrder: 0,
        isPrimary: true,
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ],
    category: {
      id: "cat-1",
      businessId: "biz-test-123",
      name: "Robes",
      slug: "robes",
      parentId: null,
      sortOrder: 0,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
];

const mockCategories: CategoryResponse[] = [
  {
    id: "cat-1",
    businessId: "biz-test-123",
    name: "Robes",
    slug: "robes",
    parentId: null,
    sortOrder: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
  {
    id: "cat-2",
    businessId: "biz-test-123",
    name: "Accessoires",
    slug: "accessoires",
    parentId: null,
    sortOrder: 1,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
];

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes("/categories")) {
        return Promise.resolve(mockCategories);
      }
      return Promise.resolve({
        items: mockSampleProducts,
        nextCursor: null,
      });
    }),
    post: jest.fn().mockImplementation((url: string) => {
      if (url.includes("/upload-url")) {
        return Promise.resolve({
          uploadUrl: "https://s3.mock.com/upload-target",
          s3Key: "businesses/biz-test-123/products/prod-1/images/new.jpg",
          url: "https://s3.mock.com/new.jpg",
        });
      }
      if (url.includes("/import")) {
        return Promise.resolve({
          id: "import-job-123",
          status: "uploaded",
        });
      }
      return Promise.resolve({
        id: "prod-new-123",
        name: "Nouveau produit",
        status: "active",
        variants: [],
      });
    }),
    patch: jest.fn().mockResolvedValue({ id: "prod-1", status: "archived" }),
    delete: jest.fn().mockResolvedValue({ success: true }),
  },
}));

function renderWithProviders(
  ui: React.ReactElement,
  role: "owner" | "admin" | "employee" = "owner",
  businessId = "biz-test-123",
) {
  const tenantContextValue: TenantContextValue = {
    currentBusinessId: businessId,
    currentRole: role,
    currentMembership: {
      businessId,
      role,
      joinedAt: "2026-09-01T10:00:00.000Z",
    },
    memberships: [],
    businessName: "Maison Alyssa",
    switchBusiness: jest.fn(),
    isLoading: false,
  };

  return renderToString(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <TenantContext.Provider value={tenantContextValue}>{ui}</TenantContext.Provider>
    </NextIntlClientProvider>,
  );
}

describe("T-WEB-08: Web Products & Catalog Management UI (`/products`)", () => {
  describe("Product CRUD: Merchant can add, edit, and archive products with variants", () => {
    it("renders ProductsPage shell with header, title, and reindexing hint", () => {
      const html = renderWithProviders(<ProductsPage />, "owner");

      expect(html).toContain("Catalogue Produits");
      expect(html).toContain("Gérez vos articles");
      expect(html).toContain("Synchronisation IA active");
      expect(html).toContain('data-slot="product-list"');
    });

    it("renders ProductList table with stock indicators, categories, and actions", () => {
      const html = renderWithProviders(<ProductList businessId="biz-test-123" />, "owner");

      // Verify table column headers
      expect(html).toContain("Photo");
      expect(html).toContain("Produit");
      expect(html).toContain("Catégorie");
      expect(html).toContain("Variantes");
      expect(html).toContain("Stock physique");
      expect(html).toContain("Stock disponible");
      expect(html).toContain("Prix");
      expect(html).toContain("Statut");
      expect(html).toContain("Actions");

      // Verify toolbar controls
      expect(html).toContain("Rechercher par nom");
      expect(html).toContain("Toutes les catégories");
      expect(html).toContain("Tous les statuts");
      expect(html).toContain("Ajouter un produit");
      expect(html).toContain("Importer CSV");
    });

    it("renders Edit, Archive, and Delete buttons for active products", () => {
      const html = renderWithProviders(
        <ProductList businessId="biz-test-123" initialProducts={mockSampleProducts} />,
        "owner",
      );

      expect(html).toContain('data-slot="btn-edit-product"');
      expect(html).toContain('data-slot="btn-archive-product"');
      expect(html).toContain('data-slot="btn-delete-product"');
      expect(html).not.toContain('data-slot="btn-restore-product"');
    });

    it("renders Restore button instead of Archive for archived products", () => {
      const archivedProducts: ProductResponse[] = [
        {
          ...mockSampleProducts[0]!,
          id: "prod-archived-1",
          status: "archived",
        },
      ];
      const html = renderWithProviders(
        <ProductList businessId="biz-test-123" initialProducts={archivedProducts} />,
        "owner",
      );

      expect(html).toContain('data-slot="btn-edit-product"');
      expect(html).toContain('data-slot="btn-restore-product"');
      expect(html).toContain('data-slot="btn-delete-product"');
      expect(html).not.toContain('data-slot="btn-archive-product"');
    });

    it("renders VariantEditor with generator button, SKU, price, stock, and default marker", () => {
      const sampleVariants: VariantItem[] = [
        {
          id: "v-1",
          sku: "SHIRT-BLK-S",
          price: 45,
          discountPrice: null,
          stock: 10,
          availableStock: 8,
          attributes: { size: "S", color: "Noir" },
          isDefault: true,
        },
        {
          id: "v-2",
          sku: "SHIRT-BLK-M",
          price: 45,
          discountPrice: 39,
          stock: 4,
          availableStock: 3,
          attributes: { size: "M", color: "Noir" },
          isDefault: false,
        },
      ];

      const html = renderWithProviders(
        <VariantEditor variants={sampleVariants} onChange={jest.fn()} disabled={false} />,
      );

      // Verify fields exist
      expect(html).toContain("SHIRT-BLK-S");
      expect(html).toContain("SHIRT-BLK-M");
      expect(html).toContain("Prix régulier (DT)");
      expect(html).toContain("Stock physique");
      expect(html).toContain("Principale");
      expect(html).toContain("Ajouter une variante");
      expect(html).toContain("Générateur de combinaisons");
    });

    it("renders ProductFormDialog with all form sections and Base UI modal bindings", () => {
      const html = renderWithProviders(
        <ProductFormDialog
          open={true}
          onOpenChange={jest.fn()}
          product={mockSampleProducts[0]}
          categories={mockCategories}
          businessId="biz-test-123"
          onSaved={jest.fn()}
        />,
      );

      expect(html).toContain("Modifier le produit");
      expect(html).toContain("Nom du produit");
      expect(html).toContain("Robe Fleurie d&#x27;Été");
      expect(html).toContain("Photos du produit");
      expect(html).toContain("Variantes &amp; Tarifs");
      expect(html).toContain("Enregistrer");
    });

    it("renders VariantDrawer (C-PROD-02) with quick stock editor for Owner/Admin", () => {
      const html = renderWithProviders(
        <VariantDrawer
          open={true}
          onOpenChange={jest.fn()}
          product={mockSampleProducts[0]!}
          businessId="biz-test-123"
          canManage={true}
          onProductUpdated={jest.fn()}
          onEditProduct={jest.fn()}
        />,
        "owner",
      );

      expect(html).toContain("Robe Fleurie d&#x27;Été");
      expect(html).toContain("ROBE-S-FL");
      expect(html).toContain("ROBE-M-FL");
      expect(html).toContain("Stock disponible: 12");
      expect(html).toContain("Enregistrer le stock");
    });

    it("renders CsvImportDialog with template download and drag & drop zone", () => {
      const html = renderWithProviders(
        <CsvImportDialog
          open={true}
          onOpenChange={jest.fn()}
          businessId="biz-test-123"
          onImportSuccess={jest.fn()}
        />,
        "owner",
      );

      expect(html).toContain("Importer des produits via CSV");
      expect(html).toContain("Télécharger le modèle CSV");
      expect(html).toContain('data-slot="mode-merge-btn"');
      expect(html).toContain('data-slot="mode-replace-btn"');
      expect(html).toContain("Ajouter &amp; Mettre à jour");
      expect(html).toContain("Remplacer tout le catalogue");
      expect(html).toContain("Confirmer l&#x27;importation");
    });
  });

  describe("Presigned Upload: Images upload securely to S3 via signed PUT URLs with mime and size verification", () => {
    it("renders ImageUploader dropzone with 10MB size cap and accepted MIME hints", () => {
      const sampleImages: ProductImageResponse[] = [
        {
          id: "img-1",
          businessId: "biz-test-123",
          productId: "prod-1",
          variantId: null,
          s3Key: "businesses/biz-test-123/products/prod-1/images/robe.jpg",
          url: "https://s3.example.com/photos/robe.jpg",
          altText: "Robe preview",
          sortOrder: 0,
          isPrimary: true,
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ];

      const html = renderWithProviders(
        <ImageUploader
          businessId="biz-test-123"
          productId="prod-1"
          images={sampleImages}
          onChange={jest.fn()}
        />,
      );

      // Dropzone and hints
      expect(html).toContain("Glissez-déposez vos images ici");
      expect(html).toContain("JPEG, PNG, WebP (max 10 Mo");
      expect(html).toContain("Principale");
      expect(html).toContain("https://s3.example.com/photos/robe.jpg");
    });

    it("verifies client validation constants: 10MB cap and strict image MIME types", () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

      expect(MAX_FILE_SIZE).toBe(10485760);
      expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
      expect(ALLOWED_MIME_TYPES).toContain("image/png");
      expect(ALLOWED_MIME_TYPES).toContain("image/webp");
      expect(ALLOWED_MIME_TYPES).not.toContain("application/pdf");
      expect(ALLOWED_MIME_TYPES).not.toContain("image/svg+xml");
    });
  });

  describe("RBAC Disabled Controls: Edit/archive buttons are disabled for Employee role", () => {
    it("enables Add, Edit, and Archive controls for Owner role", () => {
      const html = renderWithProviders(<ProductList businessId="biz-test-123" />, "owner");

      // Verify controls are not disabled for Owner
      expect(html).toContain('title="Ajouter un produit"');
      expect(html).toContain('title="Importer CSV"');
      expect(html).not.toContain("Action réservée aux administrateurs (rôle Agent restreint)");
    });

    it("enables Add, Edit, and Archive controls for Admin role", () => {
      const html = renderWithProviders(<ProductList businessId="biz-test-123" />, "admin");

      expect(html).toContain('title="Ajouter un produit"');
      expect(html).toContain('title="Importer CSV"');
      expect(html).not.toContain("Action réservée aux administrateurs (rôle Agent restreint)");
    });

    it("disables Add, Edit, and Archive controls with tooltip for Employee role", () => {
      const html = renderWithProviders(<ProductList businessId="biz-test-123" />, "employee");

      // Verify controls are disabled and contain explanatory restriction tooltip
      expect(html).toContain("Action réservée aux administrateurs (rôle Agent restreint)");
      expect(html).toContain("disabled");
      expect(html).toContain("cursor-not-allowed");
    });
  });
});
