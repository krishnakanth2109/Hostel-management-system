import mongoose from "mongoose";
import "dotenv/config";

const OLD_MONGO_URL = process.env.OLD_MONGO_URL;
const NEW_MONGO_URL = process.env.NEW_MONGO_URL;

if (!OLD_MONGO_URL || !NEW_MONGO_URL) {
  console.error("❌ OLD_MONGO_URL and NEW_MONGO_URL are required in .env");
  process.exit(1);
}

async function migrateRentPayments() {
  let oldConnection;
  let newConnection;

  try {
    oldConnection = await mongoose.createConnection(OLD_MONGO_URL).asPromise();
    newConnection = await mongoose.createConnection(NEW_MONGO_URL).asPromise();

    console.log("✅ Connected to old DB:", oldConnection.name);
    console.log("✅ Connected to new DB:", newConnection.name);

    if (oldConnection.name === newConnection.name) {
      console.error("❌ Old DB and New DB are same. Migration stopped.");
      process.exit(1);
    }

    const oldRentCollection = oldConnection.collection("rentpayments");
    const newRentCollection = newConnection.collection("rentpayments");

    // OLD DB: only read
    const oldPayments = await oldRentCollection.find({}).toArray();

    console.log(`📦 Old rent records found: ${oldPayments.length}`);

    const grouped = new Map();

    for (const oldRecord of oldPayments) {
      if (!oldRecord.owner || !oldRecord.tenantId || !oldRecord.monthYear) {
        console.log("⚠️ Skipped invalid record:", oldRecord._id);
        continue;
      }

      const key = `${oldRecord.owner.toString()}_${oldRecord.tenantId.toString()}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          owner: oldRecord.owner,
          tenantId: oldRecord.tenantId,
          monthlyPayments: [],
          createdAt: oldRecord.createdAt || new Date(),
          updatedAt: new Date(),
        });
      }

      const tenantDoc = grouped.get(key);

      const monthExists = tenantDoc.monthlyPayments.some(
        (m) => m.monthYear === oldRecord.monthYear
      );

      if (!monthExists) {
        tenantDoc.monthlyPayments.push({
          _id: new mongoose.Types.ObjectId(),
          monthYear: oldRecord.monthYear,
          dueDate: oldRecord.dueDate,
          rentAmount: oldRecord.rentAmount || 0,
          paidAmount: oldRecord.paidAmount || 0,
          status: oldRecord.status || "Due",
          payments: Array.isArray(oldRecord.payments)
            ? oldRecord.payments
            : [],
        });
      }
    }

    const finalDocs = Array.from(grouped.values()).map((doc) => {
      doc.monthlyPayments.sort((a, b) =>
        String(a.monthYear).localeCompare(String(b.monthYear))
      );
      return doc;
    });

    console.log(`✅ New tenant-wise documents prepared: ${finalDocs.length}`);

    // NEW DB: delete old test data and insert converted data
    await newRentCollection.deleteMany({});
    console.log("🧹 Cleared rentpayments in new DB");

    if (finalDocs.length > 0) {
      await newRentCollection.insertMany(finalDocs);
    }

    console.log("✅ Migration completed successfully");
    console.log(`Old records: ${oldPayments.length}`);
    console.log(`New tenant docs: ${finalDocs.length}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    if (oldConnection) await oldConnection.close();
    if (newConnection) await newConnection.close();
    process.exit(0);
  }
}

migrateRentPayments();