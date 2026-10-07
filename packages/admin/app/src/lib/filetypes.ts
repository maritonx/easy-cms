import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
} from '@lucide/vue'
import type { Component } from 'vue'

/** What a file is, for its icon, color and preview. */
export type FileKind =
  | 'image'
  | 'pdf'
  | 'word'
  | 'sheet'
  | 'slides'
  | 'archive'
  | 'audio'
  | 'video'
  | 'text'
  | 'file'

const BY_TYPE: Record<string, FileKind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.oasis.opendocument.text': 'word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'sheet',
  'text/csv': 'sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
  'application/vnd.oasis.opendocument.presentation': 'slides',
  'application/zip': 'archive',
  'text/plain': 'text',
}

export function fileKind(mimeType: unknown): FileKind {
  const type = typeof mimeType === 'string' ? mimeType : ''
  if (BY_TYPE[type]) return BY_TYPE[type]
  const group = type.split('/')[0]
  if (group === 'image' || group === 'audio' || group === 'video') return group
  return 'file'
}

export const KIND_ICON: Record<FileKind, Component> = {
  image: FileImage,
  pdf: FileType,
  word: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  audio: FileAudio,
  video: FileVideo,
  text: FileText,
  file: File,
}

/** The file's extension in capitals, e.g. `PDF`. */
export function extensionOf(filename: unknown): string {
  const name = typeof filename === 'string' ? filename : ''
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toUpperCase()
}
