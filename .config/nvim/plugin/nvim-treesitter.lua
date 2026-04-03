vim.api.nvim_create_autocmd("PackChanged", {
	callback = function(ev)
		local name, kind = ev.data.spec.name, ev.data.kind
		if name == "nvim-treesitter" and kind == "update" then
			if not ev.data.active then
				vim.cmd.packadd("nvim-treesitter")
			end
			vim.cmd("TSUpdate")
		end
	end,
})

vim.pack.add({
	{ src = "https://github.com/nvim-treesitter/nvim-treesitter", version = "main" },
	"https://github.com/wansmer/treesj",
})

local langs = {
	"bash",
	"c",
	"css",
	"go",
	"html",
	"javascript",
	"json",
	"lua",
	"toml",
	"tsx",
	"typescript",
	"vim",
	"vimdoc",
	"yaml",
	"zig",
}

local is_not_installed = function(lang)
	return #vim.api.nvim_get_runtime_file("parser/" .. lang .. ".*", false) == 0
end

local to_install = vim.tbl_filter(is_not_installed, langs)
if #to_install > 0 then
	require("nvim-treesitter").install(to_install)
	vim.notify("Installing " .. table.concat(langs))
end

local filetypes = {}
for _, lang in ipairs(langs) do
	for _, ft in ipairs(vim.treesitter.language.get_filetypes(lang)) do
		table.insert(filetypes, ft)
	end
end

vim.api.nvim_create_autocmd("FileType", {
	pattern = filetypes,
	callback = function(ev)
		vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"
		vim.wo.foldmethod = "expr"

		vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"

		vim.treesitter.start(ev.buf)
	end,
	desc = "Treesitter start",
})

vim.api.nvim_create_autocmd("FileType", {
	once = true,
	pattern = filetypes,
	callback = function()
		require("treesj").setup({
			use_default_keymaps = false,
			max_join_length = 200,
		})
		Jili.keymap("n", "<leader>sj", "<cmd>TSJToggle<cr>", "Toggle split/join")
	end,
	desc = "Treesitter start",
})
