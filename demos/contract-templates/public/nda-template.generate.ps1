# Generates demos/contract-templates/public/nda-template.docx via Word COM.
# Authors a Mutual NDA with five inline plain-text content controls in the
# header sentence and six block plain-text content controls (one per clause).
# Run on a Windows VM with Word installed:
#   powershell -ExecutionPolicy Bypass -File nda-template.generate.ps1

$ErrorActionPreference = 'Stop'

$word = New-Object -ComObject Word.Application
$word.Visible = $false

# Keep text predictable: disable smart-quote and autocorrect transformations.
try { $word.AutoCorrect.ReplaceText = $false } catch {}
try { $word.Options.AutoFormatAsYouTypeReplaceQuotes = $false } catch {}
try { $word.Options.AutoFormatAsYouTypeReplaceSymbols = $false } catch {}
try { $word.Options.AutoFormatAsYouTypeReplaceHyphens = $false } catch {}

try {
    $doc = $word.Documents.Add()
    $selection = $word.Selection

    # Heading
    $selection.Style = "Heading 1"
    [void]$selection.TypeText("Mutual Non-Disclosure Agreement")
    [void]$selection.TypeParagraph()

    # Body (Normal style)
    $selection.Style = "Normal"

    # Header sentence with placeholder markers (replaced with inline CCs below)
    [void]$selection.TypeText("This Mutual Non-Disclosure Agreement is between %F1% and %F2%, effective %F3%, for the purpose of %F4%, and remains in effect for %F5%.")
    [void]$selection.TypeParagraph()

    # Clause paragraphs (each wrapped as a block CC below)
    $clauseBodies = @(
        'The parties wish to share Confidential Information for the purposes described above and acknowledge the obligations set out in this Agreement.',
        'Each party will treat the other party''s Confidential Information as confidential and will protect it with at least the same care it uses for its own confidential information. These obligations survive disclosure for two (2) years.',
        'The Receiving Party may use Confidential Information solely for the stated purpose and for no other purpose, and will limit access to its employees and advisors with a need to know.',
        'Either party may terminate this Agreement upon thirty (30) days'' written notice. Confidentiality obligations survive termination for the period specified above.',
        'This Agreement is governed by the laws of the State of California, without regard to its conflicts of law provisions.',
        'Each party''s aggregate liability under this Agreement is limited to fees paid in the twelve (12) months preceding the claim.'
    )

    foreach ($body in $clauseBodies) {
        [void]$selection.TypeText($body)
        [void]$selection.TypeParagraph()
    }

    # Inline content controls: find each marker, delete it, wrap with a plain-text CC,
    # then set its display text.
    $inlineCCs = @(
        @{ Marker = '%F1%'; Tag = '{"kind":"smartField","key":"disclosingParty"}'; Title = 'Disclosing party'; Text = 'Acme Therapeutics' },
        @{ Marker = '%F2%'; Tag = '{"kind":"smartField","key":"receivingParty"}'; Title = 'Receiving party'; Text = 'Beacon Bio' },
        @{ Marker = '%F3%'; Tag = '{"kind":"smartField","key":"effectiveDate"}'; Title = 'Effective date'; Text = 'June 1, 2026' },
        @{ Marker = '%F4%'; Tag = '{"kind":"smartField","key":"purpose"}'; Title = 'Purpose'; Text = 'evaluating a potential collaboration' },
        @{ Marker = '%F5%'; Tag = '{"kind":"smartField","key":"termLength"}'; Title = 'Term'; Text = 'three (3) years' }
    )

    foreach ($f in $inlineCCs) {
        $range = $doc.Content
        $range.Find.ClearFormatting()
        $range.Find.Text = $f.Marker
        $range.Find.Forward = $true
        $range.Find.Wrap = 0
        $found = $range.Find.Execute()
        if (-not $found) { throw "Marker $($f.Marker) not found" }
        $range.Text = ""
        # 0 = wdContentControlText (plain text)
        $cc = $doc.ContentControls.Add(0, $range)
        $cc.Tag = $f.Tag
        $cc.Title = $f.Title
        $cc.LockContentControl = $false
        $cc.LockContents = $false
        $cc.Range.Text = $f.Text
    }

    # Block content controls: wrap each clause paragraph by passing its Range
    # (which includes the trailing paragraph mark) to ContentControls.Add.
    $blockCCs = @(
        @{ Tag = '{"kind":"reusableSection","sectionId":"preamble","version":"v1"}'; Title = 'Preamble (v1)' },
        @{ Tag = '{"kind":"reusableSection","sectionId":"confidentiality","version":"v1"}'; Title = 'Confidentiality Obligations (v1)' },
        @{ Tag = '{"kind":"reusableSection","sectionId":"permittedUse","version":"v1"}'; Title = 'Permitted Use (v1)' },
        @{ Tag = '{"kind":"reusableSection","sectionId":"termination","version":"v1"}'; Title = 'Term and Termination (v1)' },
        @{ Tag = '{"kind":"reusableSection","sectionId":"governingLaw","version":"v1"}'; Title = 'Governing Law (v1)' },
        @{ Tag = '{"kind":"reusableSection","sectionId":"limitationOfLiability","version":"v1"}'; Title = 'Limitation of Liability (v1)' }
    )

    # Paragraph indices: 1=heading, 2=header sentence, 3..8=clauses, 9=trailing empty
    for ($i = 0; $i -lt $blockCCs.Count; $i++) {
        $paraIndex = 3 + $i
        $para = $doc.Paragraphs.Item($paraIndex)
        $range = $para.Range
        $cc = $doc.ContentControls.Add(0, $range)
        $cc.Tag = $blockCCs[$i].Tag
        $cc.Title = $blockCCs[$i].Title
        $cc.LockContentControl = $false
        $cc.LockContents = $false
    }

    Write-Output "Created $($doc.ContentControls.Count) content controls"

    # SaveAs2 format 12 = wdFormatXMLDocument (.docx)
    $doc.SaveAs2('C:\word-mcp\nda-template.docx', 12)
    $doc.Close()

    Write-Output 'SUCCESS'
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
