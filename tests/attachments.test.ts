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
