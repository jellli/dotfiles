local keymap = Jili.keymap
--------------------------------------------------------------------------------
-- Source
--------------------------------------------------------------------------------

keymap("n", "<leader>X", "<cmd>source %<cr>", "Source current file")

--------------------------------------------------------------------------------
-- Movement
--------------------------------------------------------------------------------

-- Better j/k (respect count)
keymap("n", "j", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'j']], { expr = true })
keymap("n", "k", [[(v:count > 1 ? 'm`' . v:count : 'g') . 'k']], { expr = true })

-- Scroll and center
keymap("n", "<C-d>", "<C-d>zz", "Scroll down")
keymap("n", "<C-u>", "<C-u>zz", "Scroll up")

-- Search and center
keymap("n", "n", "nzzzv", "Next search result")
keymap("n", "N", "Nzzzv", "Previous search result")

-- Line navigation
keymap({ "n", "v" }, "gh", "^", "Go to start of line")
keymap({ "n", "v" }, "gl", "$", "Go to end of line")

--------------------------------------------------------------------------------
-- Editing
--------------------------------------------------------------------------------

-- Delete without yanking
keymap("n", "x", '"_x')
keymap("n", "c", '"_c')
keymap("n", "C", '"_C')

-- Paste without yanking in visual mode
keymap("v", "p", '"_dP')

-- Move lines up/down in visual mode
keymap("v", "J", ":m '>+1<cr>gv=gv")
keymap("v", "K", ":m '<-2<cr>gv=gv")

-- Stay in visual mode when indenting
keymap("v", "<", "<gv")
keymap("v", ">", ">gv")

--------------------------------------------------------------------------------
-- File
--------------------------------------------------------------------------------

keymap({ "i", "x", "n", "s" }, "<C-s>", function()
	if vim.bo.filetype == "minifiles" then
		MiniFiles.synchronize()
	else
		vim.cmd("write!")
	end

	if vim.fn.mode() ~= "n" then
		vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "n", false)
	end
end, "Save file")
keymap("n", "<leader>sn", "<cmd>noautocmd w<cr>", "Save without auto-formatting")

--------------------------------------------------------------------------------
-- Buffer
--------------------------------------------------------------------------------

keymap("n", "]b", ":bnext<cr>", "Next buffer")
keymap("n", "[b", ":bprevious<cr>", "Previous buffer")
keymap("n", "<leader>bo", "<cmd>lua require('utils').close_other_buffers()<cr>", "Close other buffers")

--------------------------------------------------------------------------------
-- Window
--------------------------------------------------------------------------------

keymap("n", "<leader>|", "<C-w>v", "Split vertically")
keymap("n", "<leader>-", "<C-w>s", "Split horizontally")

keymap("n", "<C-h>", ":wincmd h<cr>")
keymap("n", "<C-j>", ":wincmd j<cr>")
keymap("n", "<C-k>", ":wincmd k<cr>")
keymap("n", "<C-l>", ":wincmd l<cr>")

--------------------------------------------------------------------------------
-- Tab
--------------------------------------------------------------------------------

keymap("n", "<c-t><tab>", "<cmd>tabnew<cr>", "New tab")
keymap("n", "<c-t>d", "<cmd>tabclose<cr>", "Close tab")
keymap("n", "<c-t>o", "<cmd>tabonly<cr>", "Close other tabs")
keymap("n", "<c-t>]", "<cmd>tabnext<cr>", "Next tab")
keymap("n", "<c-t>[", "<cmd>tabprevious<cr>", "Previous tab")
keymap("n", "<c-t>l", "<cmd>tablast<cr>", "Last tab")
keymap("n", "<c-t>f", "<cmd>tabfirst<cr>", "First tab")

--------------------------------------------------------------------------------
-- Quickfix
--------------------------------------------------------------------------------

keymap("n", "<leader>xq", function()
	local success, err = pcall(vim.fn.getqflist({ winid = 0 }).winid ~= 0 and vim.cmd.cclose or vim.cmd.copen)
	if not success and err then
		vim.notify(err, vim.log.levels.ERROR)
	end
end, "Toggle quickfix")
keymap("n", "[q", vim.cmd.cprev, "Previous quickfix")
keymap("n", "]q", vim.cmd.cnext, "Next quickfix")

--------------------------------------------------------------------------------
-- Misc
--------------------------------------------------------------------------------

-- Escape: clear search highlight
keymap({ "i", "n", "s" }, "<esc>", function()
	vim.cmd("noh")
	vim.schedule(function()
		vim.cmd("redrawstatus!")
	end)
	return "<esc>"
end, { expr = true, desc = "Escape and clear hlsearch" })

-- Disable space default behavior
keymap("n", "<Space>", "<Nop>")
keymap("v", "<Space>", "<Nop>")

-- Macro
keymap("n", "q", "<nop>")
keymap("n", "Q", "q", "Record macro")
keymap("n", "<M-q>", "Q", "Replay last register")

-- Comment
keymap("n", "gco", "o<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", "Add comment below")
keymap("n", "gcO", "O<esc>Vcx<esc><cmd>normal gcc<cr>fxa<bs>", "Add comment above")

-- Diagnostics
keymap("n", "<leader>cd", vim.diagnostic.open_float, "Line diagnostics")

-- Toggle
keymap("n", "<leader>lw", "<cmd>set wrap!<cr>", "Toggle line wrap")

-- Messages
keymap("n", "<leader>ms", "<cmd>messages<cr>", "Messages history")

-- Restart
keymap("n", "<leader>R", "<cmd>restart<cr>", "Restart Neovim")

keymap("n", "<leader>lg", function()
	local current_dir = vim.fn.expand("%:p:h")
	vim.system({ "tmux", "display-popup", "-w 90%", "-h 90%", "-E", "lazygit", "-p", current_dir })
end, "LazyGit")
