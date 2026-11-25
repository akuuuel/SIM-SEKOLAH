<?php
/**
 * SimpleNativePDF — Generator PDF Standar 1.4 Native PHP
 * 100% murni PHP tanpa dependensi external, menghasilkan file .pdf valid
 */
class SimpleNativePDF {
    private $objects = [];
    private $offsets = [];
    private $pageObjects = [];
    private $stream = '';
    private $w = 595.28; // A4 width in pt
    private $h = 841.89; // A4 height in pt

    public function __construct() {
        $this->stream = '';
    }

    // Set warna fill RGB (0.0 - 1.0)
    public function setFillColor($r, $g, $b) {
        $this->stream .= sprintf("%.3f %.3f %.3f rg\n", $r, $g, $b);
    }

    // Set warna stroke RGB (0.0 - 1.0)
    public function setStrokeColor($r, $g, $b) {
        $this->stream .= sprintf("%.3f %.3f %.3f RG\n", $r, $g, $b);
    }

    // Gambar kotak persegi
    public function rect($x, $y, $w, $h, $style = 'F') {
        // Dalam PDF, y diukur dari bawah
        $op = 'f';
        if ($style === 'B' || $style === 'FD') $op = 'B';
        elseif ($style === 'D' || $style === 'S') $op = 'S';
        $this->stream .= sprintf("%.2f %.2f %.2f %.2f re %s\n", $x, $y, $w, $h, $op);
    }

    // Gambar garis
    public function line($x1, $y1, $x2, $y2, $lineWidth = 1) {
        $this->stream .= sprintf("%.2f w %.2f %.2f m %.2f %.2f l S\n", $lineWidth, $x1, $y1, $x2, $y2);
    }

    // Cetak teks dengan escaping karakter khusus PDF
    public function text($x, $y, $txt, $fontKey = 'F1', $size = 10) {
        $escaped = strtr($txt, [
            '\\' => '\\\\',
            '(' => '\\(',
            ')' => '\\)',
            "\r" => '',
            "\n" => ' '
        ]);
        $this->stream .= "BT\n";
        $this->stream .= sprintf("/%s %.2f Tf\n", $fontKey, $size);
        $this->stream .= sprintf("%.2f %.2f Td\n", $x, $y);
        $this->stream .= sprintf("(%s) Tj\n", $escaped);
        $this->stream .= "ET\n";
    }

    // Compile dan output binary PDF
    public function output($filename = 'laporan.pdf', $dest = 'I') {
        $pdf = "%PDF-1.4\n";

        // Object 1: Catalog
        $this->objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

        // Object 4: Font Regular (Helvetica)
        $this->objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

        // Object 5: Font Bold (Helvetica-Bold)
        $this->objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

        // Object 6: Content stream
        $len = strlen($this->stream);
        $this->objects[6] = "<< /Length " . $len . " >>\nstream\n" . $this->stream . "\nendstream";

        // Object 3: Page
        $this->objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " . $this->w . " " . $this->h . "] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>";

        // Object 2: Pages
        $this->objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";

        // Rakit file PDF
        ksort($this->objects);
        $offsets = [];
        foreach ($this->objects as $id => $content) {
            $offsets[$id] = strlen($pdf);
            $pdf .= $id . " 0 obj\n" . $content . "\nendobj\n";
        }

        $xrefPos = strlen($pdf);
        $count = count($this->objects) + 1;
        $pdf .= "xref\n0 " . $count . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i < $count; $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size " . $count . " /Root 1 0 R >>\n";
        $pdf .= "startxref\n" . $xrefPos . "\n%%EOF\n";

        if ($dest === 'D') {
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($pdf));
            header('Cache-Control: private, max-age=0, must-revalidate');
            header('Pragma: public');
        } else {
            // Inline view (bisa diunduh/disimpan dari PDF viewer)
            header('Content-Type: application/pdf');
            header('Content-Disposition: inline; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($pdf));
            header('Cache-Control: private, max-age=0, must-revalidate');
            header('Pragma: public');
        }

        echo $pdf;
        exit();
    }
}
