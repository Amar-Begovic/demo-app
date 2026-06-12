import { PrismaClient } from '../app/generated/prisma';

const prisma = new PrismaClient();

interface IndexInfo {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
}

interface ExplainResult {
  'QUERY PLAN': string;
}

async function verifyIndexes() {
  console.log('=== Verifying Database Indexes ===\n');

  try {
    // Check if indexes exist
    const indexes = await prisma.$queryRaw<IndexInfo[]>`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (
          indexname = 'NormativeVersion_articleId_isActive_idx'
          OR indexname = 'ProductionOrder_normativeVersionId_idx'
          OR indexname = 'NormativeVersionMaterial_normativeVersionStepId_materialId_idx'
        )
      ORDER BY indexname;
    `;

    console.log('📋 Index Verification Results:\n');

    const expectedIndexes = [
      'NormativeVersion_articleId_isActive_idx',
      'ProductionOrder_normativeVersionId_idx',
      'NormativeVersionMaterial_normativeVersionStepId_materialId_idx'
    ];

    const foundIndexes = indexes.map(idx => idx.indexname);

    for (const expectedIndex of expectedIndexes) {
      const found = foundIndexes.includes(expectedIndex);
      console.log(`${found ? '✅' : '❌'} ${expectedIndex}`);
      
      if (found) {
        const indexInfo = indexes.find(idx => idx.indexname === expectedIndex);
        console.log(`   Table: ${indexInfo?.tablename}`);
        console.log(`   Definition: ${indexInfo?.indexdef}\n`);
      } else {
        console.log(`   ⚠️  Index not found!\n`);
      }
    }

    // Test index usage with EXPLAIN ANALYZE
    console.log('\n=== Testing Index Usage with EXPLAIN ANALYZE ===\n');

    // Test 1: Query active normative version for an article
    console.log('🔍 Test 1: Get active normative version for an article');
    console.log('Query: SELECT * FROM "NormativeVersion" WHERE "articleId" = $1 AND "isActive" = true\n');
    
    const explain1 = await prisma.$queryRaw<ExplainResult[]>`
      EXPLAIN ANALYZE
      SELECT * FROM "NormativeVersion"
      WHERE "articleId" = '00000000-0000-0000-0000-000000000000'
        AND "isActive" = true;
    `;
    
    console.log('Execution Plan:');
    explain1.forEach(row => console.log(`  ${row['QUERY PLAN']}`));
    
    const usesIndex1 = explain1.some(row => 
      row['QUERY PLAN'].includes('NormativeVersion_articleId_isActive_idx')
    );
    console.log(`\n${usesIndex1 ? '✅' : '⚠️'} Index usage: ${usesIndex1 ? 'YES' : 'NO'}\n`);

    // Test 2: Query production orders by normative version
    console.log('🔍 Test 2: Get production orders by normative version');
    console.log('Query: SELECT * FROM "ProductionOrder" WHERE "normativeVersionId" = $1\n');
    
    const explain2 = await prisma.$queryRaw<ExplainResult[]>`
      EXPLAIN ANALYZE
      SELECT * FROM "ProductionOrder"
      WHERE "normativeVersionId" = '00000000-0000-0000-0000-000000000000';
    `;
    
    console.log('Execution Plan:');
    explain2.forEach(row => console.log(`  ${row['QUERY PLAN']}`));
    
    const usesIndex2 = explain2.some(row => 
      row['QUERY PLAN'].includes('ProductionOrder_normativeVersionId_idx')
    );
    console.log(`\n${usesIndex2 ? '✅' : '⚠️'} Index usage: ${usesIndex2 ? 'YES' : 'NO'}\n`);

    // Test 3: Query normative version materials by step and material
    console.log('🔍 Test 3: Get normative version materials by step and material');
    console.log('Query: SELECT * FROM "NormativeVersionMaterial" WHERE "normativeVersionStepId" = $1 AND "materialId" = $2\n');
    
    const explain3 = await prisma.$queryRaw<ExplainResult[]>`
      EXPLAIN ANALYZE
      SELECT * FROM "NormativeVersionMaterial"
      WHERE "normativeVersionStepId" = '00000000-0000-0000-0000-000000000000'
        AND "materialId" = '00000000-0000-0000-0000-000000000000';
    `;
    
    console.log('Execution Plan:');
    explain3.forEach(row => console.log(`  ${row['QUERY PLAN']}`));
    
    const usesIndex3 = explain3.some(row => 
      row['QUERY PLAN'].includes('NormativeVersionMaterial_normativeVersionStepId_materialId_idx')
    );
    console.log(`\n${usesIndex3 ? '✅' : '⚠️'} Index usage: ${usesIndex3 ? 'YES' : 'NO'}\n`);

    // Summary
    console.log('\n=== Summary ===\n');
    
    const allIndexesExist = expectedIndexes.every(idx => foundIndexes.includes(idx));
    const allIndexesUsed = usesIndex1 && usesIndex2 && usesIndex3;
    
    console.log(`Indexes Created: ${allIndexesExist ? '✅ All indexes exist' : '❌ Some indexes missing'}`);
    console.log(`Index Usage: ${allIndexesUsed ? '✅ All indexes are being used' : '⚠️ Some indexes not used (may be due to empty tables)'}`);
    
    if (allIndexesExist && allIndexesUsed) {
      console.log('\n✅ All verification checks passed!');
    } else if (allIndexesExist && !allIndexesUsed) {
      console.log('\n⚠️ Indexes exist but may not be used on empty tables. This is expected behavior.');
    } else {
      console.log('\n❌ Verification failed. Please check the migration.');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyIndexes()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
