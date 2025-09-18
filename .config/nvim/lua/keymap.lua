require("utils")
-- Disable the spacebar key's default behavior in Normal and Visual modes
Map("<Space>", "<Nop>")
Map("<Space>", "<Nop>", nil, "v")

Map("<C-o>", "<ESC>o", nil, "i")

-- Visual mode line movement
Map("J", ":m '>+1<CR>gv=gv", nil, "v")
Map("K", ":m '<-2<CR>gv=gv", nil, "v")

-- Save file
Map("<C-s>", "<cmd>w<CR><Esc>", "Save file", { "i", "x", "n", "s" })

-- Save file without auto-formatting
Map("<leader>sn", "<cmd>noautocmd w<CR>", "Save file without auto-formatting")

-- Delete single character without copying into register
Map("x", '"_x')
Map("c", '"_c')
Map("C", '"_C')

-- Keep last yanked when pasting
Map("p", '"_dP', nil, "v")

-- Vertical scroll and center
Map("<C-d>", "<C-d>zz", "Scroll down")
Map("<C-u>", "<C-u>zz", "Scroll up")

-- Find and center
Map("n", "nzzzv", "Next search result")
Map("N", "Nzzzv", "Previous search result")

-- Resize with arrows
-- Map("<Up>", ":resize -10<CR>")
-- Map("<Down>", ":resize +10<CR>")
-- Map("<Left>", ":vertical resize -10<CR>")
-- Map("<Right>", ":vertical resize +10<CR>")

-- Buffers
Map("<Tab>", ":bnext<CR>", "Next buffer")
Map("<S-Tab>", ":bprevious<CR>", "Previous buffer")

-- Window management
Map("<leader>v", "<C-w>v", "Split window vertically")
Map("<leader>h", "<C-w>s", "Split window horizontally")

-- Navigate between splits
Map("<C-k>", ":wincmd k<CR>")
Map("<C-j>", ":wincmd j<CR>")
Map("<C-h>", ":wincmd h<CR>")
Map("<C-l>", ":wincmd l<CR>")

-- Toggle line wrapping
Map("<leader>lw", "<cmd>set wrap!<CR>", "Toggle line wrapping")

-- Stay in indent mode
Map("<", "<gv", nil, "v")
Map(">", ">gv", nil, "v")

-- Special mappings with descriptions
Map("<leader>bo", "<cmd>:%bd|e#|bd#<cr>", "Close all buffers but the current one")
Map("<leader>lz", "<cmd>Lazy<cr>", "Lazy")

-- Quick navigation
Map("gh", "^", "Go to start of line", { "n", "v" })
Map("gl", "$", "Go to end of line", { "n", "v" })
Map("gj", "%", "Go to matching bracket", { "n", "v" })

-- diagnostic
local diagnostic_goto = function(next, severity)
	local direction = next and 1 or -1
	severity = severity and vim.diagnostic.severity[severity] or nil
	return function()
		vim.diagnostic.jump({ count = direction, severity = severity })
	end
end
Map("<leader>cd", vim.diagnostic.open_float, "Line Diagnostics")
Map("]d", diagnostic_goto(true), "Next Diagnostic")
Map("[d", diagnostic_goto(false), "Prev Diagnostic")
Map("]e", diagnostic_goto(true, "ERROR"), "Next Error")
Map("[e", diagnostic_goto(false, "ERROR"), "Prev Error")
Map("]w", diagnostic_goto(true, "WARN"), "Next Warning")
Map("[w", diagnostic_goto(false, "WARN"), "Prev Warning")

Map("<leader>qq", "<cmd>qa<cr>", "Quit All")
