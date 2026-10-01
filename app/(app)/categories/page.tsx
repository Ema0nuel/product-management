import { db } from "@/lib/db";
import { requirePermission } from "@/lib/guard";
import {
  CategoryRowActions,
  NewCategoryButton,
} from "@/components/category-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Category register: the ruled list of every category on file and the
// count of products filed under each. The register is the first step in
// the goods-inward flow, because a product cannot be recorded without a
// category to sit in (guide 6.3). A manager never reaches this sheet; the
// officer and the administrator hold manage_categories.

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requirePermission("manage_categories");

  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Category Register
          </h1>
          <p className="text-sm text-muted-foreground">
            Every product belongs to one category. The register is set before any
            stock is recorded.
          </p>
        </div>
        <NewCategoryButton />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        {categories.length} {categories.length === 1 ? "category" : "categories"} on
        file.
      </p>

      <div className="mt-3 overflow-x-auto border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.category_id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {category._count.products}
                </TableCell>
                <TableCell>
                  <CategoryRowActions
                    category={{
                      category_id: category.category_id,
                      name: category.name,
                      productCount: category._count.products,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No categories on file. Add the first category to start the register.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
