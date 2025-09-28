local utils = require("utils")

utils.map("j", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'j']], { expr = true })
utils.map("k", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'k']], { expr = true })

utils.map("<esc>", function()
  if require("luasnip").expand_or_jumpable() then
    require("luasnip").unlink_current()
    vim.notify("Snippet unlinked", vim.log.levels.INFO)
  end
  vim.cmd("noh")
  return "<esc>"
end, { expr = true, desc = "escape, clear hlsearch, and stop snippet session" }, { "i", "n", "s" })

-- Disable the spacebar key's default behavior in Normal and Visual modes
utils.map("<Space>", "<Nop>")
utils.map("<Space>", "<Nop>", nil, "v")

utils.map("<C-o>", "<esc>o", nil, "i")

-- Visual mode line movement
utils.map("J", ":m '>+1<cr>gv=gv", nil, "v")
utils.map("K", ":m '<-2<cr>gv=gv", nil, "v")

-- Save file
utils.map("<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" }, { "i", "x", "n", "s" })

-- Save file without auto-formatting
utils.map("<leader>sn", "<cmd>noautocmd w<cr>", { desc = "Save file without auto-formatting" })

-- Delete single character without copying into register
utils.map("x", '"_x')
utils.map("c", '"_c')
utils.map("C", '"_C')

-- Keep last yanked when pasting
utils.map("p", '"_dP', nil, "v")

-- Vertical scroll and center
utils.map("<C-d>", "<C-d>zz", { desc = "Scroll down" })
utils.map("<C-u>", "<C-u>zz", { desc = "Scroll up" })

-- Find and center
utils.map("n", "nzzzv", { desc = "Next search result" })
utils.map("N", "Nzzzv", { desc = "Previous search result" })

-- Resize with arrows
-- utils.map("<Up>", ":resize -10<cr>")
-- utils.map("<Down>", ":resize +10<cr>")
-- utils.map("<Left>", ":vertical resize -10<cr>")
-- utils.map("<Right>", ":vertical resize +10<cr>")

-- Buffers
utils.map("<Tab>", ":bnext<cr>", { desc = "Next buffer" })
utils.map("<S-Tab>", ":bprevious<cr>", { desc = "Previous buffer" })

-- Window management
utils.map("<leader>v", "<C-w>v", { desc = "Split window vertically" })
utils.map("<leader>h", "<C-w>s", { desc = "Split window horizontally" })

-- Navigate between splits
utils.map("<C-k>", ":wincmd k<cr>")
utils.map("<C-j>", ":wincmd j<cr>")
utils.map("<C-h>", ":wincmd h<cr>")
utils.map("<C-l>", ":wincmd l<cr>")

-- Toggle line wrapping
utils.map("<leader>lw", "<cmd>set wrap!<cr>", { desc = "Toggle line wrapping" })

-- Stay in indent mode
utils.map("<", "<gv", nil, "v")
utils.map(">", ">gv", nil, "v")

-- Special mappings with descriptions
utils.map("<leader>bo", "<cmd>:%bd|e#|bd#<cr>", { desc = "Close all buffers but the current one" })
utils.map("<leader>lz", "<cmd>Lazy<cr>", { desc = "Lazy" })

-- Quick navigation
utils.map("gh", "^", { desc = "Go to start of line" }, { "n", "v" })
utils.map("gl", "$", { desc = "Go to end of line" }, { "n", "v" })
utils.map("gj", "%", { desc = "Go to matching bracket" }, { "n", "v" })

-- diagnostic
local diagnostic_goto = function(next, severity)
  local direction = next and 1 or -1
  severity = severity and vim.diagnostic.severity[severity] or nil
  return function()
    vim.diagnostic.jump({ count = direction, severity = severity })
  end
end
utils.map("<leader>cd", vim.diagnostic.open_float, { desc = "Line Diagnostics" })
utils.map("]d", diagnostic_goto(true), { desc = "Next Diagnostic" })
utils.map("[d", diagnostic_goto(false), { desc = "Prev Diagnostic" })
utils.map("]e", diagnostic_goto(true, "ERROR"), { desc = "Next Error" })
utils.map("[e", diagnostic_goto(false, "ERROR"), { desc = "Prev Error" })
utils.map("]w", diagnostic_goto(true, "WARN"), { desc = "Next Warning" })
utils.map("[w", diagnostic_goto(false, "WARN"), { desc = "Prev Warning" })

utils.map("<leader>qq", "<cmd>qa<cr>", { desc = "Quit All" })

-- Remap q to Q so I'm not accidentally recording macros all the time
utils.map("q", "<nop>")
utils.map("Q", "q", { desc = "Record macro" })
utils.map("<M-q>", "Q", { desc = "Replay last register" })
