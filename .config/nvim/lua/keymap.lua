---@type KeymapEntry[]
local maps = {
	-- Disable the spacebar key's default behavior in Normal and Visual modes
	{ { "n", "v" }, "<Space>", "<Nop>" },

	-- Insert movement
	{ "i", "<C-h>", "<Left>" },
	{ "i", "<C-j>", "<Down>" },
	{ "i", "<C-k>", "<Up>" },
	{ "i", "<C-l>", "<Right>" },
	{ "i", "<C-o>", "<ESC>o" },

	-- Visual mode line movement
	{ "v", "J", ":m '>+1<CR>gv=gv" },
	{ "v", "K", ":m '<-2<CR>gv=gv" },

	-- Save file
	{ "n", "<C-s>", "<cmd>w<CR>" },
	{ "i", "<C-s>", "<cmd>w<CR><Esc>" },

	-- Save file without auto-formatting
	{ "n", "<leader>sn", "<cmd>noautocmd w<CR>" },

	-- Delete single character without copying into register
	{ "n", "x", '"_x' },
	{ "n", "c", '"_c' },
	{ "n", "C", '"_C' },

	-- Keep last yanked when pasting
	{ "v", "p", '"_dP' },

	-- Vertical scroll and center
	{ "n", "<C-d>", "<C-d>zz" },
	{ "n", "<C-u>", "<C-u>zz" },

	-- Find and center
	{ "n", "n", "nzzzv" },
	{ "n", "N", "Nzzzv" },

	-- Resize with arrows
	{ "n", "<Up>", ":resize -10<CR>" },
	{ "n", "<Down>", ":resize +10<CR>" },
	{ "n", "<Left>", ":vertical resize -10<CR>" },
	{ "n", "<Right>", ":vertical resize +10<CR>" },

	-- Buffers
	{ "n", "<Tab>", ":bnext<CR>" },
	{ "n", "<S-Tab>", ":bprevious<CR>" },
	{ "n", "<leader>x", ":bdelete!<CR>" }, -- close buffer

	-- Window management
	{ "n", "<leader>v", "<C-w>v" }, -- split window vertically
	{ "n", "<leader>h", "<C-w>s" }, -- split window horizontally
	{ "n", "<leader>c", ":close<CR>" }, -- close current split window

	-- Navigate between splits
	{ "n", "<C-k>", ":wincmd k<CR>" },
	{ "n", "<C-j>", ":wincmd j<CR>" },
	{ "n", "<C-h>", ":wincmd h<CR>" },
	{ "n", "<C-l>", ":wincmd l<CR>" },

	-- Toggle line wrapping
	{ "n", "<leader>lw", "<cmd>set wrap!<CR>" },

	-- Stay in indent mode
	{ "v", "<", "<gv" },
	{ "v", ">", ">gv" },

	-- Special mappings with descriptions
	{ "n", "<leader>bo", "<cmd>:%bd|e#|bd#<cr>", { desc = "Close all buffers but the current one" } },
	{ "n", "<leader>lz", "<cmd>Lazy<cr>", { desc = "Lazy" } },

	-- Quick navigation
	{ "n", "gh", "^" },
	{ "n", "gl", "$" },
	{ "n", "gj", "%" },
	{ "n", "<leader>so", "<cmd>:so ~/.config/nvim/init.lua<cr>" },
}

---@alias KeymapMode string|string[]
---@alias KeymapRhs string|function

---@class KeymapEntry
---@field [1] KeymapMode mode
---@field [2] string lhs
---@field [3] KeymapRhs rhs
---@field [4]? vim.keymap.set.Opts opts

---@param mode KeymapMode
---@param lhs string
---@param rhs KeymapRhs
---@param opts? vim.keymap.set.Opts
function map_key(mode, lhs, rhs, opts)
	local default_opts = { noremap = true, silent = true }
	local final_opts = opts and vim.tbl_extend("force", default_opts, opts) or default_opts
	vim.keymap.set(mode, lhs, rhs, final_opts)
end

for _, map in ipairs(maps) do
	local mode, lhs, rhs, opts = map[1], map[2], map[3], map[4]
	map_key(mode, lhs, rhs, opts)
end
