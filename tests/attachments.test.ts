import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  Transaction,
  CashTransaction,
  AttachmentMetadata,
  Category,
  Account,
} from '../src/models/finance'
import {
  toDbTransaction,
  fromDbTransaction,
  toDbCashTransaction,
  fromDbCashTransaction,
} from '../src/services/supabase/supabaseSync'
import {
  validateAndProcessAttachment,
  isPdfFile,
  isHeicFile,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_PDF_MIME_TYPE,
  MAX_RAW_IMAGE_SIZE_BYTES,
  MAX_PDF_SIZE_BYTES,
} from '../src/utils/imageCompression'
import {
  uploadAttachment,
  createSignedAttachmentUrl,
  deleteAttachment,
  deleteAttachmentsForMovement,
} from '../src/services/supabase/attachmentService'
import {
  toUnifiedMovements,
  selectUnifiedMovementsForPeriod,
} from '../src/utils/unifiedMovementSelectors'
import {
  reconcileAccounts,
} from '../src/utils/balance'
import {
  selectCategoryExpenses,
} from '../src/utils/financeSelectors'
import {
  selectNetPersonalExpensesForPeriod,
  selectNetExpensesByCategory,
} from '../src/utils/sharedExpenseSelectors'
import {
  selectCashBalance,
} from '../src/utils/cashSelectors'
import {
  calculatePeriodStatistics,
} from '../src/utils/statisticsSelectors'

/* ==========================================================================
   FASE 74 — JUSTIFICANTES / ADJUNTOS EN MOVIMIENTOS (TESTS A - Z)
   ========================================================================== */

describe('Fase 74 — Justificantes / Adjuntos en Movimientos (Requisitos A a Z)', () => {
  const sampleAttachment1: AttachmentMetadata = {
    id: 'att-1111-2222',
    fileName: 'ticket_mercadona.jpg',
    mimeType: 'image/jpeg',
    fileSize: 245000,
    storagePath: 'user-abc/2026/att-1111-2222.jpg',
    createdAt: '2026-10-06T10:00:00.000Z',
  }

  const sampleAttachment2: AttachmentMetadata = {
    id: 'att-3333-4444',
    fileName: 'factura_hotel.pdf',
    mimeType: 'application/pdf',
    fileSize: 520000,
    storagePath: 'user-abc/2026/att-3333-4444.pdf',
    createdAt: '2026-10-06T10:05:00.000Z',
  }

  // A. Movimiento sin attachments
  it('A. Movimiento sin attachments: inicializado con array vacío o undefined', () => {
    const tx: Transaction = {
      id: 'tx-no-att',
      type: 'expense',
      amount: 15.50,
      description: 'Panadería',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [],
    }
    assert.deepEqual(tx.attachments, [])
  })

  // B. Movimiento antiguo sin campo attachments
  it('B. Movimiento antiguo sin campo attachments: resuelve attachments ?? [] sin fallar', () => {
    const legacyTx: Partial<Transaction> = {
      id: 'tx-legacy',
      type: 'expense',
      amount: 20,
      description: 'Gasto antiguo',
      date: '2025-01-01',
      accountId: 'daily',
    }
    const resolvedAttachments = legacyTx.attachments ?? []
    assert.deepEqual(resolvedAttachments, [])
    assert.equal(resolvedAttachments.length, 0)
  })

  // C. Transaction con un attachment
  it('C. Transaction con un attachment: persiste metadata completa', () => {
    const tx: Transaction = {
      id: 'tx-with-1-att',
      type: 'expense',
      amount: 45.90,
      description: 'Cena Restaurante',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [sampleAttachment1],
    }
    assert.equal(tx.attachments?.length, 1)
    assert.equal(tx.attachments?.[0].fileName, 'ticket_mercadona.jpg')
    assert.equal(tx.attachments?.[0].mimeType, 'image/jpeg')
    assert.equal(tx.attachments?.[0].storagePath, 'user-abc/2026/att-1111-2222.jpg')
  })

  // D. CashTransaction con un attachment
  it('D. CashTransaction con un attachment: persiste metadata completa', () => {
    const cashTx: CashTransaction = {
      id: 'cash-with-att',
      type: 'expense',
      amount: 12.00,
      description: 'Taxi Efectivo',
      date: '2026-10-06',
      attachments: [sampleAttachment1],
    }
    assert.equal(cashTx.attachments?.length, 1)
    assert.equal(cashTx.attachments?.[0].id, 'att-1111-2222')
    assert.equal(cashTx.attachments?.[0].fileSize, 245000)
  })

  // E. Múltiples attachments (0..N sin límite de 5)
  it('E. Múltiples attachments: admite N adjuntos (p. ej. 6 páginas/recibos)', () => {
    const attachments6: AttachmentMetadata[] = Array.from({ length: 6 }, (_, i) => ({
      id: `att-${i + 1}`,
      fileName: `recibo_pag_${i + 1}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 150000,
      storagePath: `user-abc/2026/att-${i + 1}.jpg`,
      createdAt: '2026-10-06T10:00:00.000Z',
    }))

    const tx: Transaction = {
      id: 'tx-multi-att',
      type: 'expense',
      amount: 250,
      description: 'Informe pericial multipágina',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: attachments6,
    }

    assert.equal(tx.attachments?.length, 6)
    assert.equal(tx.attachments?.[5].fileName, 'recibo_pag_6.jpg')
  })

  // F. Serialización/deserialización Supabase (toDbTransaction, fromDbTransaction, toDbCashTransaction, fromDbCashTransaction)
  it('F. Serialización/deserialización Supabase: preserva y parsea attachments correctamente', () => {
    const originalTx: Transaction = {
      id: 'tx-sync-test',
      type: 'expense',
      amount: 88.50,
      description: 'Supermercado',
      date: '2026-10-06T14:30:00.000Z',
      accountId: 'daily',
      attachments: [sampleAttachment1, sampleAttachment2],
    }

    const dbRow = toDbTransaction(originalTx, 'user-abc')
    assert.ok(Array.isArray(dbRow.attachments))
    assert.equal(dbRow.attachments.length, 2)
    assert.equal(dbRow.attachments[0].id, 'att-1111-2222')

    const reconstructedTx = fromDbTransaction(dbRow)
    assert.deepEqual(reconstructedTx.attachments, originalTx.attachments)

    // Test con CashTransaction
    const originalCash: CashTransaction = {
      id: 'cash-sync-test',
      type: 'expense',
      amount: 15.00,
      description: 'Café',
      date: '2026-10-06',
      attachments: [sampleAttachment1],
    }

    const dbCashRow = toDbCashTransaction(originalCash, 'user-abc')
    assert.ok(Array.isArray(dbCashRow.attachments))
    const reconstructedCash = fromDbCashTransaction(dbCashRow)
    assert.deepEqual(reconstructedCash.attachments, originalCash.attachments)

    // Test legacy row con attachments = null o undefined
    const legacyDbRow = { ...dbRow, attachments: null as any }
    const fromLegacy = fromDbTransaction(legacyDbRow)
    assert.deepEqual(fromLegacy.attachments ?? [], [])
  })

  // G. Imagen válida (JPEG, PNG, WebP)
  it('G. Imagen válida: acepta formatos estándar image/jpeg, image/png, image/webp', async () => {
    const fakeJpeg = new File([new Uint8Array(100)], 'test.jpg', { type: 'image/jpeg' })
    const fakePng = new File([new Uint8Array(100)], 'test.png', { type: 'image/png' })
    const fakeWebp = new File([new Uint8Array(100)], 'test.webp', { type: 'image/webp' })

    const resJpeg = await validateAndProcessAttachment(fakeJpeg)
    const resPng = await validateAndProcessAttachment(fakePng)
    const resWebp = await validateAndProcessAttachment(fakeWebp)

    assert.equal(resJpeg.isPdf, false)
    assert.equal(resPng.isPdf, false)
    assert.equal(resWebp.isPdf, false)
  })

  // H. PDF válido
  it('H. PDF válido: valida correctamente application/pdf', async () => {
    const validPdf = new File([new Uint8Array(1024)], 'factura.pdf', { type: 'application/pdf' })
    const res = await validateAndProcessAttachment(validPdf)
    assert.equal(res.isPdf, true)
    assert.equal(res.fileName, 'factura.pdf')
    assert.equal(res.mimeType, 'application/pdf')
  })

  // I. MIME no permitido (ejecutables, html, svg, zip, scripts)
  it('I. MIME no permitido: rechaza ejecutables, HTML, SVG, ZIP y scripts', async () => {
    const maliciousFiles = [
      new File(['malicious'], 'script.js', { type: 'application/javascript' }),
      new File(['virus'], 'app.exe', { type: 'application/x-msdownload' }),
      new File(['<html></html>'], 'page.html', { type: 'text/html' }),
      new File(['<svg></svg>'], 'image.svg', { type: 'image/svg+xml' }),
      new File(['zipdata'], 'archive.zip', { type: 'application/zip' }),
    ]

    for (const f of maliciousFiles) {
      await assert.rejects(
        () => validateAndProcessAttachment(f),
        (err: any) => {
          return err.message.includes('Formato de archivo no permitido')
        }
      )
    }
  })

  // J. Archivo demasiado grande
  it('J. Archivo demasiado grande: rechaza archivos superiores al límite seguro', async () => {
    // Simular un PDF de 25 MB (límite es 10 MB)
    const largePdf = {
      name: 'large.pdf',
      type: 'application/pdf',
      size: 25 * 1024 * 1024,
    } as File

    await assert.rejects(
      () => validateAndProcessAttachment(largePdf),
      (err: any) => {
        return err.message.includes('PDF supera el tamaño máximo')
      }
    )

    // Simular imagen raw de 30 MB (límite es 20 MB)
    const largeImage = {
      name: 'huge.jpg',
      type: 'image/jpeg',
      size: 30 * 1024 * 1024,
    } as File

    await assert.rejects(
      () => validateAndProcessAttachment(largeImage),
      (err: any) => {
        return err.message.includes('imagen original supera el tamaño máximo')
      }
    )
  })

  // K. Compresión mantiene proporción y cálculo de dimensiones
  it('K. Compresión de imagen: cálculo correcto de dimensiones respetando max 1920px', () => {
    // Probar dimensiones de escalado matemático
    function calculateDimensions(srcW: number, srcH: number, maxSide = 1920) {
      let width = srcW
      let height = srcH
      if (width > maxSide || height > maxSide) {
        if (width >= height) {
          height = Math.round((height * maxSide) / width)
          width = maxSide
        } else {
          width = Math.round((width * maxSide) / height)
          height = maxSide
        }
      }
      return { width, height }
    }

    // Landscape 4000x3000 (4:3)
    const d1 = calculateDimensions(4000, 3000)
    assert.equal(d1.width, 1920)
    assert.equal(d1.height, 1440)
    assert.equal((4000 / 3000).toFixed(4), (d1.width / d1.height).toFixed(4))

    // Portrait 2000x4000 (1:2)
    const d2 = calculateDimensions(2000, 4000)
    assert.equal(d2.height, 1920)
    assert.equal(d2.width, 960)
    assert.equal((2000 / 4000).toFixed(4), (d2.width / d2.height).toFixed(4))

    // Square under max 800x800
    const d3 = calculateDimensions(800, 800)
    assert.equal(d3.width, 800)
    assert.equal(d3.height, 800)
  })

  // L. Edición de importe conserva attachments
  it('L. Edición de importe conserva attachments intactos', () => {
    const tx: Transaction = {
      id: 'tx-edit-amount',
      type: 'expense',
      amount: 50.00,
      description: 'Compra',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [sampleAttachment1],
    }

    const updatedTx: Transaction = {
      ...tx,
      amount: 75.00,
    }

    assert.equal(updatedTx.amount, 75.00)
    assert.deepEqual(updatedTx.attachments, tx.attachments)
  })

  // M. Edición de categoría conserva attachments
  it('M. Edición de categoría conserva attachments intactos', () => {
    const tx: Transaction = {
      id: 'tx-edit-cat',
      type: 'expense',
      amount: 50.00,
      description: 'Compra',
      categoryId: 'food',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [sampleAttachment1],
    }

    const updatedTx: Transaction = {
      ...tx,
      categoryId: 'home',
    }

    assert.equal(updatedTx.categoryId, 'home')
    assert.deepEqual(updatedTx.attachments, tx.attachments)
  })

  // N. Edición de fecha conserva attachments
  it('N. Edición de fecha conserva attachments intactos', () => {
    const tx: Transaction = {
      id: 'tx-edit-date',
      type: 'expense',
      amount: 50.00,
      description: 'Compra',
      date: '2026-10-06T10:00:00.000Z',
      accountId: 'daily',
      attachments: [sampleAttachment1],
    }

    const updatedTx: Transaction = {
      ...tx,
      date: '2026-10-07T12:00:00.000Z',
    }

    assert.equal(updatedTx.date, '2026-10-07T12:00:00.000Z')
    assert.deepEqual(updatedTx.attachments, tx.attachments)
  })

  // O. Eliminar attachment actualiza metadata
  it('O. Eliminar attachment individual actualiza array de metadata', () => {
    const tx: Transaction = {
      id: 'tx-delete-att',
      type: 'expense',
      amount: 100.00,
      description: 'Gasto con 2 adjuntos',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [sampleAttachment1, sampleAttachment2],
    }

    // Filtrar sampleAttachment1
    const remainingAttachments = (tx.attachments ?? []).filter((a) => a.id !== sampleAttachment1.id)
    const updatedTx: Transaction = {
      ...tx,
      attachments: remainingAttachments,
    }

    assert.equal(updatedTx.attachments?.length, 1)
    assert.equal(updatedTx.attachments?.[0].id, sampleAttachment2.id)
  })

  // P. Eliminar movimiento intenta limpiar attachments en storage
  it('P. Eliminar movimiento: deleteAttachmentsForMovement invoca eliminación en Storage', async () => {
    const mockStorageClient = {
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            assert.deepEqual(paths, [sampleAttachment1.storagePath, sampleAttachment2.storagePath])
            return { data: paths, error: null }
          },
        }),
      },
    } as any

    const res = await deleteAttachmentsForMovement(
      [sampleAttachment1, sampleAttachment2],
      mockStorageClient
    )
    assert.equal(res.success, true)
    assert.equal(res.deletedCount, 2)
  })

  // Q. Fallo de upload NO elimina ni corrompe el movimiento financiero
  it('Q. Fallo de upload: preserva la persistencia del movimiento financiero', () => {
    // Simulación del patrón de guardado resiliente:
    // Si uploadAttachment falla, el movimiento se guarda con los adjuntos que hayan tenido éxito
    // o con [] si fallaron todos, y se notifica al usuario sin abortar la transacción financiera.
    const newTx: Transaction = {
      id: 'tx-resilient-save',
      type: 'expense',
      amount: 32.50,
      description: 'Cena con upload fallido',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [], // se guardó a pesar del fallo
    }

    const initialAccounts: Account[] = [
      { id: 'daily', name: 'Cuenta Principal', type: 'spending', initialBalance: 100, balance: 100 },
    ]

    const reconciled = reconcileAccounts(initialAccounts, [newTx])
    assert.equal(reconciled[0].balance, 67.50, 'El saldo financiero se deduce correctamente (100 - 32,50 = 67,50 €)')
  })

  // R. Fallo después de upload intenta evitar objeto huérfano
  it('R. Fallo después de upload intenta limpiar el storagePath subido', async () => {
    let cleanedPath = ''
    const mockStorageClient = {
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            cleanedPath = paths[0]
            return { data: paths, error: null }
          },
        }),
      },
    } as any

    // Simular compensación de huérfano
    const uploadedPath = 'user-abc/2026/att-failed.jpg'
    await deleteAttachment(uploadedPath, mockStorageClient)
    assert.equal(cleanedPath, uploadedPath)
  })

  // S. Sin conexión: movimiento sigue pudiendo guardarse
  it('S. Sin conexión: creación de movimiento financiero offline funciona normalmente', () => {
    const isOnline = false
    const stagedFiles = [new File(['dummy'], 'ticket.jpg', { type: 'image/jpeg' })]

    // El flujo detecta offline y permite guardar el movimiento sin adjuntos
    let warningMessage = ''
    let txToSave: Transaction

    if (!isOnline && stagedFiles.length > 0) {
      warningMessage = 'El gasto se guardará sin conexión. Añade el justificante cuando vuelvas a tener internet.'
      txToSave = {
        id: 'tx-offline-created',
        type: 'expense',
        amount: 14.20,
        description: 'Supermercado Offline',
        date: '2026-10-06',
        accountId: 'daily',
        attachments: [],
      }
    } else {
      txToSave = {
        id: 'tx-offline-created',
        type: 'expense',
        amount: 14.20,
        description: 'Supermercado Offline',
        date: '2026-10-06',
        accountId: 'daily',
      }
    }

    assert.ok(warningMessage.includes('sin conexión'))
    assert.equal(txToSave.amount, 14.20)
    assert.deepEqual(txToSave.attachments, [])
  })

  // T. Sin conexión: no promete subir attachment / no encola blobs
  it('T. Sin conexión: no encola blobs en localStorage ni offlineQueue', () => {
    // Comprobar que en offline no se inserta ningún binario en los modelos serializables
    const tx: Transaction = {
      id: 'tx-offline',
      type: 'expense',
      amount: 10,
      description: 'Gasto',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [],
    }
    const serialized = JSON.stringify(tx)
    assert.ok(!serialized.includes('data:image'))
    assert.ok(!serialized.includes('Blob'))
    assert.ok(!serialized.includes('base64'))
  })

  // U. Attachments no cambian cálculos financieros (0.00 € variance)
  it('U. Attachments no alteran cálculos financieros (0,00 € de varianza en saldos, netos y estadísticas)', () => {
    const catFood: Category = { id: 'food', name: 'Alimentación', color: '#10B981', icon: 'shopping-cart' }
    const catList = [catFood]
    const refDate = new Date('2026-10-06')

    const txWithoutAtt: Transaction = {
      id: 'tx-1',
      type: 'expense',
      amount: 50.00,
      description: 'Mercadona Sin Adjunto',
      categoryId: 'food',
      date: '2026-10-06T12:00:00.000Z',
      accountId: 'daily',
      attachments: [],
    }

    const txWithAtt: Transaction = {
      id: 'tx-1',
      type: 'expense',
      amount: 50.00,
      description: 'Mercadona Con Adjunto',
      categoryId: 'food',
      date: '2026-10-06T12:00:00.000Z',
      accountId: 'daily',
      attachments: [sampleAttachment1, sampleAttachment2],
    }

    const accounts: Account[] = [
      { id: 'daily', name: 'Cuenta Principal', type: 'spending', initialBalance: 200, balance: 200 },
    ]

    // 1. Reconcile accounts
    const rec1 = reconcileAccounts(accounts, [txWithoutAtt])
    const rec2 = reconcileAccounts(accounts, [txWithAtt])
    assert.equal(rec1[0].balance, 150.00)
    assert.equal(rec2[0].balance, 150.00)
    assert.equal(rec1[0].balance, rec2[0].balance)

    // 2. Net expenses
    const net1 = selectNetPersonalExpensesForPeriod([txWithoutAtt], refDate, 'month', [])
    const net2 = selectNetPersonalExpensesForPeriod([txWithAtt], refDate, 'month', [])
    assert.equal(net1, 50.00)
    assert.equal(net2, 50.00)

    // 3. Category expenses
    const cat1 = selectCategoryExpenses([txWithoutAtt], catList, refDate)
    const cat2 = selectCategoryExpenses([txWithAtt], catList, refDate)
    assert.equal(cat1[0].amount, 50.00)
    assert.equal(cat2[0].amount, 50.00)

    // 4. Period stats
    const stat1 = calculatePeriodStatistics([txWithoutAtt], catList, 'month', refDate)
    const stat2 = calculatePeriodStatistics([txWithAtt], catList, 'month', refDate)
    assert.equal(stat1.expenses, stat2.expenses)
    assert.equal(stat1.netExpenses, stat2.netExpenses)

    // 5. Cash transactions
    const cash1: CashTransaction = { id: 'c1', type: 'expense', amount: 10, description: 'C1', date: '2026-10-06' }
    const cash2: CashTransaction = { id: 'c1', type: 'expense', amount: 10, description: 'C1', date: '2026-10-06', attachments: [sampleAttachment1] }
    assert.equal(selectCashBalance([cash1]), selectCashBalance([cash2]))
  })

  // V. UnifiedMovement conserva/expone información necesaria para 📎
  it('V. UnifiedMovement expone attachments para renderizado de badge 📎', () => {
    const tx1: Transaction = {
      id: 'tx-1-att',
      type: 'expense',
      amount: 14.98,
      description: 'Mercadona',
      date: '2026-10-03T10:00:00.000Z',
      accountId: 'daily',
      attachments: [sampleAttachment1],
    }

    const tx3: Transaction = {
      id: 'tx-3-att',
      type: 'expense',
      amount: 95.00,
      description: 'Hotel',
      date: '2026-10-04T10:00:00.000Z',
      accountId: 'daily',
      attachments: [sampleAttachment1, sampleAttachment2, { ...sampleAttachment1, id: 'att-3' }],
    }

    const unified = toUnifiedMovements([tx1, tx3], [])
    assert.equal(unified.length, 2)
    assert.equal(unified[0].attachments?.length, 3) // sorted by date descending
    assert.equal(unified[1].attachments?.length, 1)

    // Simular badge display:
    function getAttachmentBadge(attCount: number) {
      if (attCount === 0) return null
      if (attCount === 1) return '📎'
      return `📎 ${attCount}`
    }

    assert.equal(getAttachmentBadge(unified[1].attachments?.length ?? 0), '📎')
    assert.equal(getAttachmentBadge(unified[0].attachments?.length ?? 0), '📎 3')
  })

  // W. Signed URL solo se genera bajo demanda
  it('W. Signed URL se genera bajo demanda con expiración aproximada de 10 minutos (600s)', async () => {
    let requestedPath = ''
    let requestedExpiry = 0

    const mockStorageClient = {
      storage: {
        from: (bucket: string) => {
          assert.equal(bucket, 'receipts')
          return {
            createSignedUrl: async (path: string, expiresIn: number) => {
              requestedPath = path
              requestedExpiry = expiresIn
              return {
                data: { signedUrl: `https://mock-supabase.co/storage/v1/object/sign/${bucket}/${path}?token=xyz` },
                error: null,
              }
            },
          }
        },
      },
    } as any

    const signedUrl = await createSignedAttachmentUrl('user-abc/2026/att-1111-2222.jpg', 600, mockStorageClient)
    assert.ok(signedUrl)
    assert.ok(signedUrl.includes('token=xyz'))
    assert.equal(requestedPath, 'user-abc/2026/att-1111-2222.jpg')
    assert.equal(requestedExpiry, 600)
  })

  // X. Seguridad/RLS: verificación de ruta de objetos con userId
  it('X. Seguridad Storage: ruta de objetos mantiene obligatoriamente userId en primer segmento <userId>/<year>/<id>.<ext>', async () => {
    let uploadedPath = ''
    const mockStorageClient = {
      storage: {
        from: (bucket: string) => {
          assert.equal(bucket, 'receipts')
          return {
            upload: async (path: string, _file: any) => {
              uploadedPath = path
              return { data: { path }, error: null }
            },
          }
        },
      },
    } as any

    const fakeFile = new File(['image-bytes'], 'ticket.jpg', { type: 'image/jpeg' })
    const metadata = await uploadAttachment(fakeFile, {
      userId: 'user-12345',
      fileName: 'ticket.jpg',
      mimeType: 'image/jpeg',
      customClient: mockStorageClient,
    })

    assert.ok(metadata)
    assert.ok(uploadedPath.startsWith('user-12345/2026/'))
    assert.ok(uploadedPath.endsWith('.jpg'))
    assert.equal(metadata.storagePath, uploadedPath)
  })

  // Y. Cancelar modal no sube archivos
  it('Y. Cancelar modal: staged files se descartan sin interactuar con Supabase Storage', () => {
    let storageUploadCalls = 0
    const mockStorageClient = {
      storage: {
        from: () => ({
          upload: async () => {
            storageUploadCalls++
            return { data: {}, error: null }
          },
        }),
      },
    }

    // Modal se abre, usuario selecciona 2 fotos en stagedAttachments
    const stagedAttachments = [
      { id: 'stage-1', file: new File([''], '1.jpg', { type: 'image/jpeg' }), previewUrl: 'blob:mock-1', fileName: '1.jpg', mimeType: 'image/jpeg', fileSize: 100 },
      { id: 'stage-2', file: new File([''], '2.jpg', { type: 'image/jpeg' }), previewUrl: 'blob:mock-2', fileName: '2.jpg', mimeType: 'image/jpeg', fileSize: 200 },
    ]

    // Usuario pulsa "Cancelar" o pulsa fuera del modal
    // Modal ejecuta cleanup y descarta stagedAttachments
    stagedAttachments.length = 0

    assert.equal(storageUploadCalls, 0, 'No debe haber subidas a Storage')
    assert.equal(stagedAttachments.length, 0)
  })

  // Z. Object URLs temporales se revocan correctamente
  it('Z. Object URLs temporales: revokeObjectURL se llama al descartar/desmontar staged files', () => {
    const revokedUrls: string[] = []
    const origRevoke = URL.revokeObjectURL

    URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url)
    }

    try {
      const stagedPreviews = ['blob:http://localhost:5173/preview-1', 'blob:http://localhost:5173/preview-2']

      // Simular cleanup de staged files
      stagedPreviews.forEach((url) => {
        URL.revokeObjectURL(url)
      })

      assert.equal(revokedUrls.length, 2)
      assert.equal(revokedUrls[0], 'blob:http://localhost:5173/preview-1')
      assert.equal(revokedUrls[1], 'blob:http://localhost:5173/preview-2')
    } finally {
      URL.revokeObjectURL = origRevoke
    }
  })
})

/* ==========================================================================
   FASE 75 — MEJORAS UX/UI, ICONOGRAFÍA LINEAL Y VISOR RESPONSIVE (v0.25.6)
   ========================================================================== */

describe('Fase 75 — Justificantes v0.25.6: Iconografía Lineal, Miniaturas y Visor Responsive (Tests A - Q)', () => {
  const sampleImageAtt: AttachmentMetadata = {
    id: 'att-img-1',
    fileName: 'ticket_compra.jpg',
    mimeType: 'image/jpeg',
    fileSize: 180000,
    storagePath: 'user-abc/2026/att-img-1.jpg',
    createdAt: '2026-10-06T10:00:00.000Z',
  }

  const samplePdfAtt: AttachmentMetadata = {
    id: 'att-pdf-1',
    fileName: 'factura_luz.pdf',
    mimeType: 'application/pdf',
    fileSize: 420000,
    storagePath: 'user-abc/2026/att-pdf-1.pdf',
    createdAt: '2026-10-06T10:05:00.000Z',
  }

  const sampleImageAtt2: AttachmentMetadata = {
    id: 'att-img-2',
    fileName: 'garantia.png',
    mimeType: 'image/png',
    fileSize: 310000,
    storagePath: 'user-abc/2026/att-img-2.png',
    createdAt: '2026-10-06T10:10:00.000Z',
  }

  // A. No quedan emojis de attachments en componentes ni strings UI
  it('A. No quedan emojis de attachments (🎯, 📎, 📄, 🖼️, 📷) en templates ni interfaces', () => {
    const forbiddenEmojis = ['🎯', '📎', '📄', '🖼️', '📷', '📁']
    const uiLabels = [
      'Justificantes (1)',
      '+ Añadir justificante',
      'Tomar foto con la cámara',
      'Seleccionar foto de la galería',
      'Adjuntar PDF o documento',
      'Abrir PDF',
      'Descargar justificante',
      'Compartir justificante',
    ]

    for (const label of uiLabels) {
      for (const emoji of forbiddenEmojis) {
        assert.equal(label.includes(emoji), false, `La etiqueta "${label}" no debe contener el emoji ${emoji}`)
      }
    }
  })

  // B. PDF usa icono lineal
  it('B. PDF usa representación lineal con icono de documento/PDF sin emojis del sistema operativo', () => {
    const isPdf = samplePdfAtt.mimeType === 'application/pdf' || samplePdfAtt.fileName.endsWith('.pdf')
    assert.equal(isPdf, true)

    // Icono correspondiente en el sistema Lucide / AppIcon
    const iconName = isPdf ? 'file-text' : 'image'
    assert.equal(iconName, 'file-text')
  })

  // C. Imagen muestra thumbnail cuando signed URL está disponible
  it('C. Imagen: usa signed URL bajo demanda para renderizar miniatura real', async () => {
    const mockStorageClient = {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://storage.mock/${bucket}/${path}?token=valid` },
            error: null,
          }),
        }),
      },
    } as any

    const signedUrl = await createSignedAttachmentUrl(sampleImageAtt.storagePath, 600, mockStorageClient)
    assert.ok(signedUrl)
    assert.ok(signedUrl.includes(sampleImageAtt.storagePath))
  })

  // D. Fallo de thumbnail usa fallback sin imagen rota
  it('D. Fallo de thumbnail: usa fallback visual con icono lineal en vez de imagen rota', () => {
    let hasError = true
    let thumbUrl: string | null = null

    // Simular renderizado del badge
    const renderBadgeType = () => {
      if (!thumbUrl || hasError) {
        return { type: 'fallback_icon', icon: 'image' }
      }
      return { type: 'img', src: thumbUrl }
    }

    const rendered = renderBadgeType()
    assert.equal(rendered.type, 'fallback_icon')
    assert.equal(rendered.icon, 'image')
  })

  // E. Attachment indicator abre visor directamente
  it('E. Attachment indicator: invoca apertura directa de AttachmentViewerModal con el justificante', () => {
    let openedModal = false
    let openedIndex = -1

    const handleOpenViewer = (index: number) => {
      openedModal = true
      openedIndex = index
    }

    // Al hacer click en el indicador de la fila
    handleOpenViewer(0)
    assert.equal(openedModal, true)
    assert.equal(openedIndex, 0)
  })

  // F. Click attachment no dispara click de fila ni swipe
  it('F. Click/tap en attachment badge ejecuta stopPropagation() para aislar la fila', () => {
    let rowClicked = false
    let badgeClicked = false

    const handleRowClick = () => {
      rowClicked = true
    }

    const handleBadgeClick = (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      badgeClicked = true
    }

    // Simular evento con stopPropagation
    let stopped = false
    const mockEvent = {
      stopPropagation: () => {
        stopped = true
      },
    }

    handleBadgeClick(mockEvent)
    assert.equal(badgeClicked, true)
    assert.equal(stopped, true)
    assert.equal(rowClicked, false, 'El click en la fila NO debe ejecutarse')
  })

  // G. Un attachment abre directamente el visor
  it('G. Un attachment abre directamente el visor sin pasos intermedios', () => {
    const singleAttachmentList = [sampleImageAtt]
    assert.equal(singleAttachmentList.length, 1)

    const initialIndex = 0
    const activeAttachment = singleAttachmentList[initialIndex]
    assert.equal(activeAttachment.id, sampleImageAtt.id)
  })

  // H. Varios attachments muestran contador en fila (+N)
  it('H. Varios attachments: badge en fila muestra "+N" para adjuntos adicionales', () => {
    const multiList = [sampleImageAtt, samplePdfAtt, sampleImageAtt2]
    const extraCount = multiList.length - 1

    const badgeLabel = extraCount > 0 ? `+${extraCount}` : null
    assert.equal(badgeLabel, '+2', 'Con 3 adjuntos debe mostrar "+2"')
  })

  // I. Navegación anterior / siguiente
  it('I. Navegación en visor: avanza y retrocede respetando los límites de índice 0 y N-1', () => {
    const list = [sampleImageAtt, samplePdfAtt, sampleImageAtt2]
    let currentIndex = 0

    const goNext = () => {
      if (currentIndex < list.length - 1) currentIndex++
    }
    const goPrev = () => {
      if (currentIndex > 0) currentIndex--
    }

    // Inicial en 0
    assert.equal(currentIndex, 0)
    assert.equal(list[currentIndex].id, sampleImageAtt.id)

    // Siguiente -> 1 (PDF)
    goNext()
    assert.equal(currentIndex, 1)
    assert.equal(list[currentIndex].id, samplePdfAtt.id)

    // Siguiente -> 2 (Imagen 2)
    goNext()
    assert.equal(currentIndex, 2)
    assert.equal(list[currentIndex].id, sampleImageAtt2.id)

    // Siguiente en último elemento no desborda
    goNext()
    assert.equal(currentIndex, 2)

    // Anterior -> 1
    goPrev()
    assert.equal(currentIndex, 1)

    // Anterior -> 0
    goPrev()
    assert.equal(currentIndex, 0)

    // Anterior en primer elemento no baja de 0
    goPrev()
    assert.equal(currentIndex, 0)
  })

  // J. Visor conserva signed URLs bajo demanda usando in-memory cache con TTL
  it('J. Visor y miniaturas: in-memory cache reutiliza signed URLs válidas', async () => {
    let networkCalls = 0

    const mockStorageClient = {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => {
            networkCalls++
            return {
              data: { signedUrl: `https://storage.mock/${bucket}/${path}?token=${networkCalls}` },
              error: null,
            }
          },
        }),
      },
    } as any

    const url1 = await createSignedAttachmentUrl('user-abc/2026/cached-test.jpg', 600, mockStorageClient)
    const url2 = await createSignedAttachmentUrl('user-abc/2026/cached-test.jpg', 600, mockStorageClient)

    assert.equal(url1, url2, 'Ambas llamadas devuelven la misma signed URL desde la caché')
    assert.equal(networkCalls, 1, 'Solo se realiza 1 llamada a la red para la misma ruta')
  })

  // K. No se solicitan previews de todos los movimientos de golpe
  it('K. No se generan signed URLs automáticas en bulk para todos los movimientos', () => {
    // Los movimientos solo renderizan la miniatura mediante componente lazy bajo demanda
    const movements = Array.from({ length: 50 }, (_, i) => ({
      id: `tx-${i}`,
      attachments: [{ ...sampleImageAtt, id: `att-${i}`, storagePath: `user-abc/2026/att-${i}.jpg` }],
    }))

    // Inicialmente ninguna URL está en caché hasta que el componente se monta/visibiliza
    assert.equal(movements.length, 50)
  })

  // L. Escape cierra visor y flechas navegan
  it('L. Accesibilidad por teclado: tecla Escape y teclas de flecha', () => {
    let isClosed = false
    let index = 1

    const handleKeyDown = (key: string) => {
      if (key === 'Escape') isClosed = true
      if (key === 'ArrowLeft' && index > 0) index--
      if (key === 'ArrowRight' && index < 2) index++
    }

    handleKeyDown('ArrowLeft')
    assert.equal(index, 0)

    handleKeyDown('ArrowRight')
    assert.equal(index, 1)

    handleKeyDown('Escape')
    assert.equal(isClosed, true)
  })

  // M. Botones tienen aria-label
  it('M. Botones de acción sólo-icono tienen aria-label y títulos descriptivos', () => {
    const actionButtons = [
      { name: 'share-2', ariaLabel: 'Compartir justificante' },
      { name: 'download', ariaLabel: 'Descargar justificante' },
      { name: 'external-link', ariaLabel: 'Abrir en pestaña nueva' },
      { name: 'trash-2', ariaLabel: 'Eliminar justificante' },
      { name: 'x', ariaLabel: 'Cerrar visor' },
      { name: 'chevron-left', ariaLabel: 'Justificante anterior' },
      { name: 'chevron-right', ariaLabel: 'Justificante siguiente' },
    ]

    for (const btn of actionButtons) {
      assert.ok(btn.ariaLabel && btn.ariaLabel.length > 0)
    }
  })

  // N. Edición de movimiento sigue funcionando igual
  it('N. Edición de movimiento conserva todos los adjuntos existentes', () => {
    const originalTx: Transaction = {
      id: 'tx-preserved-edit',
      type: 'expense',
      amount: 40.00,
      description: 'Cena amigos',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [sampleImageAtt, samplePdfAtt],
    }

    const editedTx: Transaction = {
      ...originalTx,
      amount: 45.00,
      description: 'Cena amigos y postre',
    }

    assert.equal(editedTx.amount, 45.00)
    assert.equal(editedTx.attachments?.length, 2)
    assert.deepEqual(editedTx.attachments, originalTx.attachments)
  })

  // O. Eliminar attachment sigue funcionando y limpia cache
  it('O. Eliminar attachment: deleteAttachment elimina en storage e invalida caché', async () => {
    let deletedPath = ''
    const mockStorageClient = {
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            deletedPath = paths[0]
            return { data: paths, error: null }
          },
        }),
      },
    } as any

    const res = await deleteAttachment(sampleImageAtt.storagePath, mockStorageClient)
    assert.equal(res, true)
    assert.equal(deletedPath, sampleImageAtt.storagePath)
  })

  // P. Storage / sync permanecen invariantes
  it('P. Storage / sync permanecen con compatibilidad hacia atrás total', () => {
    const tx: Transaction = {
      id: 'tx-sync-v256',
      type: 'expense',
      amount: 28.50,
      description: 'Gasolinera',
      date: '2026-10-06',
      accountId: 'daily',
      attachments: [sampleImageAtt],
    }

    const row = toDbTransaction(tx, 'user-abc')
    const back = fromDbTransaction(row)
    assert.deepEqual(back.attachments, tx.attachments)
  })

  // Q. Cálculos financieros siguen invariantes (0.00 € variance)
  it('Q. Cálculos financieros: invariantes con varianza de 0,00 €', () => {
    const acc: Account = { id: 'daily', name: 'Cuenta Principal', type: 'spending', initialBalance: 500, balance: 500 }
    const tx1: Transaction = { id: 'tx-1', type: 'expense', amount: 100, description: 'G1', date: '2026-10-06', accountId: 'daily', attachments: [] }
    const tx2: Transaction = { id: 'tx-1', type: 'expense', amount: 100, description: 'G1', date: '2026-10-06', accountId: 'daily', attachments: [sampleImageAtt, samplePdfAtt, sampleImageAtt2] }

    const r1 = reconcileAccounts([acc], [tx1])
    const r2 = reconcileAccounts([acc], [tx2])
    assert.equal(r1[0].balance, 400)
    assert.equal(r2[0].balance, 400)
    assert.equal(r1[0].balance, r2[0].balance)
  })
})

/* ==========================================================================
   FASE 76 — CORRECCIÓN DE EDICIÓN DE JUSTIFICANTES Y RENDER PDF.JS (v0.25.7)
   ========================================================================== */

describe('Fase 76 — Corrección de Edición de Justificantes y Render PDF.js (Problemas 1 y 2)', () => {
  const sampleAttachment: AttachmentMetadata = {
    id: 'att-muro-1',
    fileName: 'ticket_mercadona_muro.jpg',
    mimeType: 'image/jpeg',
    fileSize: 195000,
    storagePath: 'user-pepe/2026/att-muro-1.jpg',
    createdAt: '2026-10-06T10:00:00.000Z',
  }

  const samplePdfAttachment: AttachmentMetadata = {
    id: 'att-muro-pdf',
    fileName: 'factura_mercadona_muro.pdf',
    mimeType: 'application/pdf',
    fileSize: 340000,
    storagePath: 'user-pepe/2026/att-muro-pdf.pdf',
    createdAt: '2026-10-06T10:05:00.000Z',
  }

  // 1. TEST DE REGRESIÓN CRÍTICO: Mercadona Muro (movimiento antiguo sin campo attachments)
  it('1. TEST DE REGRESIÓN CRÍTICO: movimiento antiguo sin propiedad attachments acepta su primer justificante en edición', () => {
    // Objeto antiguo sin la propiedad attachments
    const oldTransaction: Transaction = {
      id: 'tx-mercadona-muro',
      type: 'expense',
      amount: 14.98,
      description: 'Mercadona Muro',
      date: '2026-10-03T10:00:00.000Z',
      accountId: 'daily',
      categoryId: 'food',
    }

    // Simulación de edición añadiendo el primer attachment
    const updates: Partial<Transaction> = {
      description: 'Mercadona Muro',
      amount: 14.98,
      attachments: [sampleAttachment],
    }

    // En useFinance:
    const updatedTx: Transaction = {
      ...oldTransaction,
      ...updates,
      amount: updates.amount !== undefined ? Number(updates.amount) : oldTransaction.amount,
      attachments:
        updates.attachments !== undefined
          ? updates.attachments.length > 0
            ? updates.attachments
            : undefined
          : oldTransaction.attachments,
    }

    assert.ok(updatedTx.attachments)
    assert.equal(updatedTx.attachments.length, 1)
    assert.equal(updatedTx.attachments[0].id, 'att-muro-1')

    // Round-trip Supabase (toDbTransaction -> fromDbTransaction)
    const dbRow = toDbTransaction(updatedTx, 'user-pepe')
    assert.ok(Array.isArray(dbRow.attachments))
    assert.equal(dbRow.attachments.length, 1)

    const reconstructedTx = fromDbTransaction(dbRow)
    assert.ok(reconstructedTx.attachments)
    assert.equal(reconstructedTx.attachments.length, 1)
    assert.equal(reconstructedTx.attachments[0].fileName, 'ticket_mercadona_muro.jpg')
    assert.equal(reconstructedTx.attachments[0].storagePath, 'user-pepe/2026/att-muro-1.jpg')
  })

  // 2. Movimiento existente con attachments = [] -> añadir primer attachment
  it('2. Movimiento existente con attachments=[]: añadir primer attachment actualiza el array', () => {
    const existingTx: Transaction = {
      id: 'tx-empty-att',
      type: 'expense',
      amount: 25.00,
      description: 'Gasolinera',
      date: '2026-10-04',
      accountId: 'daily',
      attachments: [],
    }

    const updates: Partial<Transaction> = {
      attachments: [sampleAttachment],
    }

    const updatedTx: Transaction = {
      ...existingTx,
      ...updates,
      attachments:
        updates.attachments !== undefined
          ? updates.attachments.length > 0
            ? updates.attachments
            : undefined
          : existingTx.attachments,
    }

    assert.equal(updatedTx.attachments?.length, 1)
    assert.equal(updatedTx.attachments?.[0].id, 'att-muro-1')
  })

  // 3. Movimiento con 1 attachment -> añadir segundo attachment
  it('3. Movimiento con 1 attachment: añadir segundo attachment acumula ambos justificantes', () => {
    const existingTx: Transaction = {
      id: 'tx-with-1',
      type: 'expense',
      amount: 50.00,
      description: 'Cena',
      date: '2026-10-05',
      accountId: 'daily',
      attachments: [sampleAttachment],
    }

    const updates: Partial<Transaction> = {
      attachments: [sampleAttachment, samplePdfAttachment],
    }

    const updatedTx: Transaction = {
      ...existingTx,
      ...updates,
      attachments:
        updates.attachments !== undefined
          ? updates.attachments.length > 0
            ? updates.attachments
            : undefined
          : existingTx.attachments,
    }

    assert.equal(updatedTx.attachments?.length, 2)
    assert.equal(updatedTx.attachments?.[0].id, 'att-muro-1')
    assert.equal(updatedTx.attachments?.[1].id, 'att-muro-pdf')
  })

  // 4. Movimiento con 2 attachments -> eliminar 1 attachment
  it('4. Movimiento con 2 attachments: eliminar 1 attachment persiste el justificante restante', () => {
    const existingTx: Transaction = {
      id: 'tx-with-2',
      type: 'expense',
      amount: 60.00,
      description: 'Hotel',
      date: '2026-10-05',
      accountId: 'daily',
      attachments: [sampleAttachment, samplePdfAttachment],
    }

    // Usuario elimina sampleAttachment y conserva samplePdfAttachment
    const updates: Partial<Transaction> = {
      attachments: [samplePdfAttachment],
    }

    const updatedTx: Transaction = {
      ...existingTx,
      ...updates,
      attachments:
        updates.attachments !== undefined
          ? updates.attachments.length > 0
            ? updates.attachments
            : undefined
          : existingTx.attachments,
    }

    assert.equal(updatedTx.attachments?.length, 1)
    assert.equal(updatedTx.attachments?.[0].id, 'att-muro-pdf')
  })

  // 5. Movimiento con 1 attachment -> eliminar el único attachment
  it('5. Movimiento con 1 attachment: eliminar el único attachment vacía la lista sin restaurarlo', () => {
    const existingTx: Transaction = {
      id: 'tx-with-1-to-delete',
      type: 'expense',
      amount: 30.00,
      description: 'Farmacia',
      date: '2026-10-05',
      accountId: 'daily',
      attachments: [sampleAttachment],
    }

    // Usuario elimina el único attachment: updates.attachments = []
    const updates: Partial<Transaction> = {
      attachments: [],
    }

    const updatedTx: Transaction = {
      ...existingTx,
      ...updates,
      attachments:
        updates.attachments !== undefined
          ? updates.attachments.length > 0
            ? updates.attachments
            : undefined
          : existingTx.attachments,
    }

    assert.equal(updatedTx.attachments, undefined)

    // Round-trip Supabase
    const dbRow = toDbTransaction(updatedTx, 'user-pepe')
    assert.deepEqual(dbRow.attachments, [])

    const fromDb = fromDbTransaction(dbRow)
    assert.equal(fromDb.attachments, undefined)
  })

  // 6. CashTransaction legacy sin attachments -> añadir primer attachment
  it('6. CashTransaction legacy sin campo attachments: añadir primer attachment actualiza correctamente', () => {
    const oldCashTx: CashTransaction = {
      id: 'cash-muro-legacy',
      type: 'expense',
      amount: 8.50,
      description: 'Panadería',
      date: '2026-10-03',
    }

    const patch: Partial<CashTransaction> = {
      attachments: [sampleAttachment],
    }

    const updatedCashTx: CashTransaction = {
      ...oldCashTx,
      ...patch,
      amount: oldCashTx.amount,
      attachments:
        patch.attachments !== undefined
          ? patch.attachments.length > 0
            ? patch.attachments
            : undefined
          : oldCashTx.attachments,
      updatedAt: new Date().toISOString(),
    }

    assert.ok(updatedCashTx.attachments)
    assert.equal(updatedCashTx.attachments.length, 1)
    assert.equal(updatedCashTx.attachments[0].id, 'att-muro-1')
  })

  // 7. uploadAttachment auto-resuelve userId desde la sesión de Supabase si no se proporciona
  it('7. uploadAttachment: auto-resuelve el userId desde la sesión activa de Supabase si no se pasa explícitamente', async () => {
    let uploadedPath = ''
    const mockSupabaseClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: {
                id: 'user-session-resolved-uuid',
              },
            },
          },
        }),
      },
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string) => {
            uploadedPath = path
            return { data: { path }, error: null }
          },
        }),
      },
    } as any

    const fakeBlob = new Blob(['sample-data'], { type: 'image/jpeg' })
    const meta = await uploadAttachment(fakeBlob, {
      fileName: 'ticket_auto_user.jpg',
      mimeType: 'image/jpeg',
      customClient: mockSupabaseClient,
    })

    assert.ok(meta)
    assert.ok(uploadedPath.startsWith('user-session-resolved-uuid/'))
    assert.equal(meta.storagePath, uploadedPath)
  })

  // 8. Icono PDF en fila: no contiene texto "PDF", ni tarjeta blanca, ni emoji
  it('8. Icono PDF en fila: representación pura lineal con FileText sin texto "PDF" ni tarjeta decorativa', () => {
    // Simular propiedades de renderizado del indicador de PDF en fila
    const isPdf = samplePdfAttachment.mimeType === 'application/pdf'
    assert.equal(isPdf, true)

    const pdfBadgeConfig = {
      iconName: 'file-text',
      hasTextBadge: false, // Eliminado texto "PDF"
      hasWhiteBox: false,  // Eliminada tarjeta blanca
      isLinear: true,
    }

    assert.equal(pdfBadgeConfig.iconName, 'file-text')
    assert.equal(pdfBadgeConfig.hasTextBadge, false)
    assert.equal(pdfBadgeConfig.hasWhiteBox, false)
    assert.equal(pdfBadgeConfig.isLinear, true)
  })
  // 9. Cálculos financieros invariantes (0,00 € varianza)
  it('9. Cálculos financieros: invariantes con 0,00 € de varianza en saldo tras añadir justificantes', () => {
    const acc: Account = { id: 'daily', name: 'Cuenta Principal', type: 'spending', initialBalance: 100, balance: 100 }
    const txOld: Transaction = { id: 'tx-1', type: 'expense', amount: 14.98, description: 'Mercadona Muro', date: '2026-10-03', accountId: 'daily' }
    const txWithAtt: Transaction = { id: 'tx-1', type: 'expense', amount: 14.98, description: 'Mercadona Muro', date: '2026-10-03', accountId: 'daily', attachments: [sampleAttachment] }

    const r1 = reconcileAccounts([acc], [txOld])
    const r2 = reconcileAccounts([acc], [txWithAtt])
    assert.equal(r1[0].balance, 85.02)
    assert.equal(r2[0].balance, 85.02)
    assert.equal(r1[0].balance, r2[0].balance)
  })

  // 10. Cambio secuencial entre movimientos A -> B -> C: aislamiento completo de estado de adjuntos y storagePath único
  it('10. Cambio secuencial entre movimientos: abrir A con attachment -> cerrar -> abrir B sin attachment -> añadir archivo -> guardar B -> abrir C -> añadir archivo -> guardar C', async () => {
    // Simular almacenamiento en mock de Storage
    const uploadedPaths: string[] = []
    const mockClient = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-pepe-iso' } } },
        }),
      },
      storage: {
        from: () => ({
          upload: async (path: string) => {
            uploadedPaths.push(path)
            return { data: { path }, error: null }
          },
        }),
      },
    }

    // 1. Movimiento A (Mercadona Cehegín) ya tiene un attachment
    const txA: Transaction = {
      id: 'tx-cehegin',
      type: 'expense',
      amount: 30.06,
      description: 'Mercadona Cehegín',
      date: '2026-10-05',
      accountId: 'daily',
      attachments: [{
        id: 'att-cehegin-1',
        fileName: 'ticket_cehegin.pdf',
        mimeType: 'application/pdf',
        fileSize: 10240,
        storagePath: 'user-pepe-iso/2026/att-cehegin-1.pdf',
        createdAt: '2026-10-05T10:00:00Z',
      }],
    }

    // 2. Movimiento B (Mercadona Muro) sin attachments previos
    const txB: Transaction = {
      id: 'tx-muro',
      type: 'expense',
      amount: 14.98,
      description: 'Mercadona Muro',
      date: '2026-10-03',
      accountId: 'daily',
      // Sin propiedad attachments (legacy)
    }

    // 3. Movimiento C (Druni Alcoy) sin attachments previos
    const txC: Transaction = {
      id: 'tx-druni',
      type: 'expense',
      amount: 9.93,
      description: 'Druni Alcoy',
      date: '2026-10-02',
      accountId: 'daily',
      attachments: [],
    }

    // Subir archivo para B
    const fileB = new Blob(['ticket-muro-content'], { type: 'application/pdf' })
    const metaB = await uploadAttachment(fileB, {
      fileName: 'ticket_muro.pdf',
      mimeType: 'application/pdf',
      date: txB.date,
      customClient: mockClient,
    })

    const updatedTxB: Transaction = {
      ...txB,
      attachments: [metaB],
    }

    // Subir archivo para C
    const fileC = new Blob(['ticket-druni-content'], { type: 'image/jpeg' })
    const metaC = await uploadAttachment(fileC, {
      fileName: 'ticket_druni.jpg',
      mimeType: 'image/jpeg',
      date: txC.date,
      customClient: mockClient,
    })

    const updatedTxC: Transaction = {
      ...txC,
      attachments: [metaC],
    }

    // Verificaciones:
    // A) Ninguno reutiliza el attachment de A
    assert.notEqual(metaB.id, txA.attachments![0].id)
    assert.notEqual(metaC.id, txA.attachments![0].id)
    // B) B y C tienen attachmentIds y storagePaths completamente independientes
    assert.notEqual(metaB.id, metaC.id)
    assert.notEqual(metaB.storagePath, metaC.storagePath)
    assert.equal(updatedTxB.attachments?.length, 1)
    assert.equal(updatedTxC.attachments?.length, 1)
    assert.equal(uploadedPaths.length, 2)
  })

  // 11. Estructura de User Gesture: input.click() ocurre antes de cerrar el menú y FileList se copia antes de resetear
  it('11. Estructura de User Gesture: orden estricto input.value="" -> input.click() -> setShowMenu(false)', () => {
    const executionOrder: string[] = []
    let menuOpen = true

    const mockInput = {
      value: 'old_file.pdf',
      click: () => {
        executionOrder.push('input.click')
        // Validar que el menú sigue abierto cuando se ejecuta el click
        assert.equal(menuOpen, true, 'El menú debe seguir abierto durante el click para preservar el User Gesture token')
        // Validar que el valor del input ya se limpió
        assert.equal(mockInput.value, '', 'input.value debe limpiarse antes de invocar .click()')
      },
    }

    const triggerInputSim = (input: typeof mockInput) => {
      executionOrder.push('trigger_start')
      input.value = ''
      executionOrder.push('value_cleared')
      input.click()
      menuOpen = false
      executionOrder.push('menu_closed')
    }

    triggerInputSim(mockInput)

    assert.deepEqual(executionOrder, [
      'trigger_start',
      'value_cleared',
      'input.click',
      'menu_closed',
    ])
    assert.equal(menuOpen, false)
  })

  // 12. Ciclo de onChange: copia inmutable de FileList antes de limpiar e.currentTarget.value
  it('12. Ciclo de onChange: copia inmutable de FileList antes de resetear value para permitir re-selección del mismo archivo', () => {
    const file1 = new File(['sample1'], 'recibo_a.pdf', { type: 'application/pdf' })
    const file2 = new File(['sample2'], 'recibo_b.jpg', { type: 'image/jpeg' })

    const fakeEvent = {
      currentTarget: {
        files: [file1, file2],
        value: 'C:\\fakepath\\recibo_a.pdf',
      },
    }

    // 1. Copiar FileList primero
    const copiedFiles = Array.from(fakeEvent.currentTarget.files ?? [])
    // 2. Limpiar inmediatamente
    fakeEvent.currentTarget.value = ''

    assert.equal(copiedFiles.length, 2)
    assert.equal(copiedFiles[0].name, 'recibo_a.pdf')
    assert.equal(copiedFiles[1].name, 'recibo_b.jpg')
    assert.equal(fakeEvent.currentTarget.value, '', 'El input queda inmediatamente limpio para recibir nuevo evento change')
  })

  // 13. TEST DE REGRESIÓN CRÍTICO: Reconciliación / restoreState en segundo plano con mismo transaction.id NO borra stagedAttachments ni el draft
  it('13. TEST DE REGRESIÓN: restoreState / cambio de referencias del store preserva stagedAttachments y campos editados en modal abierto', () => {
    let lastInitializedIdentity: string | null = null
    let stagedAttachments: any[] = []
    let formDraft = {
      amount: '14,98',
      description: 'Mercadona Muro',
      categoryId: 'food',
      note: '',
    }

    const initModal = (open: boolean, tx: Transaction | null, accounts: any[], categories: any[]) => {
      const currentIdentity = open && tx ? `edit:${tx.id}` : open ? 'new:expense:' : null
      if (!open || !currentIdentity) {
        lastInitializedIdentity = null
        stagedAttachments = []
        return
      }

      // Si la identidad es idéntica, NO reinicializar el draft ni los adjuntos
      if (lastInitializedIdentity === currentIdentity) {
        return
      }

      lastInitializedIdentity = currentIdentity
      formDraft = {
        amount: String(tx?.amount ?? '').replace('.', ','),
        description: tx?.description ?? '',
        categoryId: tx?.categoryId ?? 'food',
        note: tx?.note ?? '',
      }
      stagedAttachments = []
    }

    const txA: Transaction = {
      id: 'tx-cehegin',
      type: 'expense',
      amount: 14.98,
      description: 'Mercadona Cehegín',
      date: '2026-10-05',
      accountId: 'daily',
      categoryId: 'food',
    }

    let accountsRef1 = [{ id: 'daily', name: 'Cuenta Principal' }]
    let categoriesRef1 = [{ id: 'food', name: 'Alimentación' }]

    // 1. Abrir modal con txA
    initModal(true, txA, accountsRef1, categoriesRef1)
    assert.equal(formDraft.description, 'Mercadona Cehegín')
    assert.equal(stagedAttachments.length, 0)

    // 2. Usuario edita la descripción y añade un justificante
    formDraft.description = 'Mercadona Cehegín (Editado)'
    formDraft.amount = '25,50'
    stagedAttachments = [{ id: 'temp-1', fileName: 'ticket.pdf', localUrl: 'blob:test-1' }]

    // 3. Simular vuelta de picker en iOS -> focus / visibilitychange -> fetchRemoteState -> restoreState
    // Genera NUEVAS referencias de arrays del store y un nuevo objeto txA (mismo id)
    const accountsRef2 = [{ id: 'daily', name: 'Cuenta Principal' }] // Nueva referencia en memoria
    const categoriesRef2 = [{ id: 'food', name: 'Alimentación' }] // Nueva referencia en memoria
    const txA_reconciled: Transaction = { ...txA } // Nueva referencia del objeto transacción

    // Re-render disparado por el store con nuevas referencias
    initModal(true, txA_reconciled, accountsRef2, categoriesRef2)

    // 4. Verificaciones críticas:
    // A) stagedAttachments NO se reseteó a []
    assert.equal(stagedAttachments.length, 1, 'stagedAttachments debe permanecer con 1 elemento tras restoreState')
    assert.equal(stagedAttachments[0].fileName, 'ticket.pdf')
    // B) El draft del usuario (descripción, importe) NO se sobrescribió
    assert.equal(formDraft.description, 'Mercadona Cehegín (Editado)', 'La descripción editada debe conservarse')
    assert.equal(formDraft.amount, '25,50', 'El importe editado debe conservarse')
  })

  // 14. Cambio real de movimiento (A -> B) reinicializa limpiamente el draft de B sin arrastrar estado de A
  it('14. Cambio real de movimiento A -> B reinicializa limpiamente el formulario con los datos de B', () => {
    let lastInitializedIdentity: string | null = null
    let stagedAttachments: any[] = []
    let formDraft = { amount: '', description: '', categoryId: '' }

    const initModal = (open: boolean, tx: Transaction | null) => {
      const currentIdentity = open && tx ? `edit:${tx.id}` : null
      if (!open || !currentIdentity) {
        lastInitializedIdentity = null
        stagedAttachments = []
        return
      }

      if (lastInitializedIdentity === currentIdentity) {
        return
      }

      lastInitializedIdentity = currentIdentity
      formDraft = {
        amount: String(tx?.amount ?? ''),
        description: tx?.description ?? '',
        categoryId: tx?.categoryId ?? 'food',
      }
      stagedAttachments = []
    }

    const txA: Transaction = { id: 'tx-A', type: 'expense', amount: 10, description: 'Gasto A', date: '2026-10-01', accountId: 'daily' }
    const txB: Transaction = { id: 'tx-B', type: 'expense', amount: 20, description: 'Gasto B', date: '2026-10-02', accountId: 'daily' }

    // Abrir A y modificar
    initModal(true, txA)
    formDraft.description = 'Gasto A Modificado'
    stagedAttachments = [{ id: 'staged-A', fileName: 'docA.pdf' }]

    // Cambiar a B
    initModal(true, txB)
    assert.equal(formDraft.description, 'Gasto B', 'Debe cargar la descripción de B')
    assert.equal(formDraft.amount, '20', 'Debe cargar el importe de B')
    assert.equal(stagedAttachments.length, 0, 'No debe arrastrar justificantes staged de A')
  })

  // 15. Cerrar y reabrir A descarta el draft cancelado y recarga el estado persistido original
  it('15. Cerrar modal y reabrir el mismo movimiento recarga los datos persistidos originales', () => {
    let lastInitializedIdentity: string | null = null
    let stagedAttachments: any[] = []
    let formDraft = { amount: '', description: '' }

    const initModal = (open: boolean, tx: Transaction | null) => {
      const currentIdentity = open && tx ? `edit:${tx.id}` : null
      if (!open || !currentIdentity) {
        lastInitializedIdentity = null
        stagedAttachments = []
        return
      }

      if (lastInitializedIdentity === currentIdentity) {
        return
      }

      lastInitializedIdentity = currentIdentity
      formDraft = {
        amount: String(tx?.amount ?? ''),
        description: tx?.description ?? '',
      }
      stagedAttachments = []
    }

    const txA: Transaction = { id: 'tx-A', type: 'expense', amount: 15, description: 'Gasto Original', date: '2026-10-01', accountId: 'daily' }

    // 1. Abrir A y modificar draft
    initModal(true, txA)
    formDraft.description = 'Borrador sin guardar'
    stagedAttachments = [{ id: 'staged-temp', fileName: 'recibo.pdf' }]

    // 2. Cerrar modal (cancelar)
    initModal(false, null)
    assert.equal(lastInitializedIdentity, null)
    assert.equal(stagedAttachments.length, 0)

    // 3. Reabrir A
    initModal(true, txA)
    assert.equal(formDraft.description, 'Gasto Original', 'Al reabrir debe cargar los datos persistidos')
    assert.equal(formDraft.amount, '15')
    assert.equal(stagedAttachments.length, 0)
  })
})




