local map = require("utils").map

map("j", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'j']], { expr = true })
map("k", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'k']], { expr = true })

map("<esc>", function()
  if require("luasnip").expand_or_jumpable() then
    require("luasnip").unlink_current()
    vim.notify("Snippet unlinked", vim.log.levels.INFO)
  end
  vim.cmd("noh")
  return "<esc>"
end, { expr = true, desc = "escape, clear hlsearch, and stop snippet session" }, { "i", "n", "s" })

-- Disable the spacebar key's default behavior in Normal and Visual modes
map("<Space>", "<Nop>")
map("<Space>", "<Nop>", nil, "v")

map("<C-o>", "<esc>o", nil, "i")

-- Visual mode line movement
map("J", ":m '>+1<cr>gv=gv", nil, "v")
map("K", ":m '<-2<cr>gv=gv", nil, "v")

-- Save file
map("<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" }, { "i", "x", "n", "s" })

-- Save file without auto-formatting
map("<leader>sn", "<cmd>noautocmd w<cr>", { desc = "Save file without auto-formatting" })

-- Delete single character without copying into register
map("x", '"_x')
map("c", '"_c')
map("C", '"_C')

-- Keep last yanked when pasting
map("p", '"_dP', nil, "v")

-- Vertical scroll and center
map("<C-d>", "<C-d>zz", { desc = "Scroll down" })
map("<C-u>", "<C-u>zz", { desc = "Scroll up" })

-- Find and center
map("n", "nzzzv", { desc = "Next search result" })
map("N", "Nzzzv", { desc = "Previous search result" })

-- Resize with arrows
map("<Up>", ":resize -10<cr>")
map("<Down>", ":resize +10<cr>")
map("<Left>", ":vertical resize -10<cr>")
map("<Right>", ":vertical resize +10<cr>")

-- Buffers
map("]b", ":bnext<cr>", { desc = "Next buffer" })
map("[b", ":bprevious<cr>", { desc = "Previous buffer" })

-- Window management
map("<leader>v", "<C-w>v", { desc = "Split window vertically" })
map("<leader>h", "<C-w>s", { desc = "Split window horizontally" })

-- Navigate between splits
map("<C-k>", ":wincmd k<cr>")
map("<C-j>", ":wincmd j<cr>")
map("<C-h>", ":wincmd h<cr>")
map("<C-l>", ":wincmd l<cr>")

-- Toggle line wrapping
map("<leader>lw", "<cmd>set wrap!<cr>", { desc = "Toggle line wrapping" })

-- Stay in indent mode
map("<", "<gv", nil, "v")
map(">", ">gv", nil, "v")

-- Special mappings with descriptions
map("<leader>bo", "<cmd>:%bd|e#|bd#<cr>", { desc = "Close all buffers but the current one" })
map("<leader>lz", "<cmd>Lazy<cr>", { desc = "Lazy" })

-- Quick navigation
map("gh", "^", { desc = "Go to start of line" }, { "n", "v" })
map("gl", "$", { desc = "Go to end of line" }, { "n", "v" })
map("gj", "%", { desc = "Go to matching bracket" }, { "n", "v" })

-- diagnostic
local diagnostic_goto = function(next, severity)
  local direction = next and 1 or -1
  severity = severity and vim.diagnostic.severity[severity] or nil
  return function()
    vim.diagnostic.jump({ count = direction, severity = severity })
  end
end
map("<leader>cd", vim.diagnostic.open_float, { desc = "Line Diagnostics" })
map("]d", diagnostic_goto(true), { desc = "Next Diagnostic" })
map("[d", diagnostic_goto(false), { desc = "Prev Diagnostic" })
map("]e", diagnostic_goto(true, "ERROR"), { desc = "Next Error" })
map("[e", diagnostic_goto(false, "ERROR"), { desc = "Prev Error" })
map("]w", diagnostic_goto(true, "WARN"), { desc = "Next Warning" })
map("[w", diagnostic_goto(false, "WARN"), { desc = "Prev Warning" })

map("<leader>qq", "<cmd>qa<cr>", { desc = "Quit All" })

-- Remap q to Q so I'm not accidentally recording macros all the time
map("q", "<nop>")
map("Q", "q", { desc = "Record macro" })
map("<M-q>", "Q", { desc = "Replay last register" })

map("<leader>R", "<cmd>restart<cr>", { desc = "Restart" })

-- commenting
map("gco", "o<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", { desc = "Add Comment Below" })
map("gcO", "O<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", { desc = "Add Comment Above" })

-- tabs
map("<leader><tab>l", "<cmd>tablast<cr>", { desc = "Last Tab" })
map("<leader><tab>o", "<cmd>tabonly<cr>", { desc = "Close Other Tabs" })
map("<leader><tab>f", "<cmd>tabfirst<cr>", { desc = "First Tab" })
map("<leader><tab><tab>", "<cmd>tabnew<cr>", { desc = "New Tab" })
map("<leader><tab>]", "<cmd>tabnext<cr>", { desc = "Next Tab" })
map("<leader><tab>d", "<cmd>tabclose<cr>", { desc = "Close Tab" })
map("<leader><tab>[", "<cmd>tabprevious<cr>", { desc = "Previous Tab" })
