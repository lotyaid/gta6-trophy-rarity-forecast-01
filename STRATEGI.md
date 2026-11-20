# Strategi entry — Rarity Forecast

Sudut berbeda (arahan user: jangan ambil jalur paling ramai): baseline house adalah persistensi (rate terakhir + random walk). Kebanyakan peserta kemungkinan mengekstrapolasi rate mentah. Entry ini memodelkan MEKANISME-nya:

1. Penghasilan trophy = distribusi waktu penyelesaian (lognormal CDF) — pemain cepat konversi duluan, sisanya makin lambat. Ekstrapolasi tren logit lurus meledak melewati asimtot (terbukti di uji sintetis: loss 0,49); CDF menang (0,17) vs persistensi (0,29) pada skenario minggu peluncuran sintetis.
2. Penyebut (pemain terlacak) dimodelkan terpisah — lonjakan pemain baru mengencerkan rate trophy lambat; tren rate mentah tidak melihat ini.
3. Lebar kuantil dari noise binomial jumlah penghasil + sisa fit + horizon — bukan angka tetap.

Verifikasi lokal: format output valid di 2 practice case, deterministik, runtime 0,17 detik (batas 8 detik/case).
