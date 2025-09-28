require("utils")

Map("j", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'j']], { expr = true })
Map("k", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'k']], { expr = true })

Map("<esc>", function()
  if require("luasnip").expand_or_jumpable() then
    require("luasnip").unlink_current()
    vim.notify("Snippet unlinked", vim.log.levels.INFO)
  end
  vim.cmd("noh")
  return "<esc>"
end, { expr = true, desc = "escape, clear hlsearch, and stop snippet session" }, { "i", "n", "s" })

-- Disable the spacebar key's default behavior in Normal and Visual modes
Map("<Space>", "<Nop>")
Map("<Space>", "<Nop>", nil, "v")

Map("<C-o>", "<esc>o", nil, "i")

-- Visual mode line movement
Map("J", ":m '>+1<cr>gv=gv", nil, "v")
Map("K", ":m '<-2<cr>gv=gv", nil, "v")

-- Save file
Map("<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" }, { "i", "x", "n", "s" })

-- Save file without auto-formatting
Map("<leader>sn", "<cmd>noautocmd w<cr>", { desc = "Save file without auto-formatting" })

-- Delete single character without copying into register
Map("x", '"_x')
Map("c", '"_c')
Map("C", '"_C')

-- Keep last yanked when pasting
Map("p", '"_dP', nil, "v")

-- Vertical scroll and center
Map("<C-d>", "<C-d>zz", { desc = "Scroll down" })
Map("<C-u>", "<C-u>zz", { desc = "Scroll up" })

-- Find and center
Map("n", "nzzzv", { desc = "Next search result" })
Map("N", "Nzzzv", { desc = "Previous search result" })

-- Resize with arrows
-- Map("<Up>", ":resize -10<cr>")
-- Map("<Down>", ":resize +10<cr>")
-- Map("<Left>", ":vertical resize -10<cr>")
-- Map("<Right>", ":vertical resize +10<cr>")

-- Buffers
Map("<Tab>", ":bnext<cr>", { desc = "Next buffer" })
Map("<S-Tab>", ":bprevious<cr>", { desc = "Previous buffer" })

-- Window management
Map("<leader>v", "<C-w>v", { desc = "Split window vertically" })
Map("<leader>h", "<C-w>s", { desc = "Split window horizontally" })

-- Navigate between splits
Map("<C-k>", ":wincmd k<cr>")
Map("<C-j>", ":wincmd j<cr>")
Map("<C-h>", ":wincmd h<cr>")
Map("<C-l>", ":wincmd l<cr>")

-- Toggle line wrapping
Map("<leader>lw", "<cmd>set wrap!<cr>", { desc = "Toggle line wrapping" })

-- Stay in indent mode
Map("<", "<gv", nil, "v")
Map(">", ">gv", nil, "v")

-- Special mappings with descriptions
Map("<leader>bo", "<cmd>:%bd|e#|bd#<cr>", { desc = "Close all buffers but the current one" })
Map("<leader>lz", "<cmd>Lazy<cr>", { desc = "Lazy" })

-- Quick navigation
Map("gh", "^", { desc = "Go to start of line" }, { "n", "v" })
Map("gl", "$", { desc = "Go to end of line" }, { "n", "v" })
Map("gj", "%", { desc = "Go to matching bracket" }, { "n", "v" })

-- diagnostic
local diagnostic_goto = function(next, severity)
  local direction = next and 1 or -1
  severity = severity and vim.diagnostic.severity[severity] or nil
  return function()
    vim.diagnostic.jump({ count = direction, severity = severity })
  end
end
Map("<leader>cd", vim.diagnostic.open_float, { desc = "Line Diagnostics" })
Map("]d", diagnostic_goto(true), { desc = "Next Diagnostic" })
Map("[d", diagnostic_goto(false), { desc = "Prev Diagnostic" })
Map("]e", diagnostic_goto(true, "ERROR"), { desc = "Next Error" })
Map("[e", diagnostic_goto(false, "ERROR"), { desc = "Prev Error" })
Map("]w", diagnostic_goto(true, "WARN"), { desc = "Next Warning" })
Map("[w", diagnostic_goto(false, "WARN"), { desc = "Prev Warning" })

Map("<leader>qq", "<cmd>qa<cr>", { desc = "Quit All" })

-- Remap q to Q so I'm not accidentally recording macros all the time
Map("q", "<nop>")
Map("Q", "q", { desc = "Record macro" })
Map("<M-q>", "Q", { desc = "Replay last register" })
